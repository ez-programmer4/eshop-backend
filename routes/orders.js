const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const Referral = require("../models/Referral");
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");
const Product = require("../models/Product");
const Bundle = require("../models/Bundle"); // Add Bundle model
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { sendOrderConfirmation } = require("../utils/email");
const mongoose = require("mongoose");

// Get all orders (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders called");
    const orders = await Order.find()
      .populate("items.productId", "name price")
      .populate("userId", "email");
    res.json(orders);
  } catch (err) {
    console.error("GET /api/orders error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Get user's own orders
router.get("/my-orders", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/my-orders called for user:", req.user.id);
    const orders = await Order.find({ userId: req.user.id }).populate(
      "items.productId",
      "name price"
    );
    res.json(orders);
  } catch (err) {
    console.error("GET /api/orders/my-orders error:", err.stack);
    res.status(400).json({ message: "Bad request" });
  }
});

// Create a new order
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      billingAddress,
      paymentMethod,
      referralCode,
      pnr,
      total: clientTotal,
      logoUrl,
    } = req.body;

    // Validate required fields
    if (!items || !shippingAddress || !billingAddress || !paymentMethod) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Fetch products and bundles
    const productIds = items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const bundleIds = items
      .filter((item) => item.bundleId)
      .map((item) => item.bundleId);
    const bundles = bundleIds.length
      ? await Bundle.find({ _id: { $in: bundleIds } })
      : [];

    // Calculate total server-side with bundle discounts
    let total = 0;
    const validatedItems = items
      .map((item, index) => {
        const product = products.find(
          (p) => p._id.toString() === item.productId.toString()
        );
        if (!product) {
          console.warn(
            `Item ${index + 1} has invalid productId: ${item.productId}`
          );
          return null; // Mark invalid items
        }

        let itemPrice = product.price || 0;
        if (item.bundleId) {
          const bundle = bundles.find(
            (b) => b._id.toString() === item.bundleId.toString()
          );
          if (bundle && bundle.discount) {
            // Apply bundle discount (e.g., 15%)
            const discountMultiplier = 1 - bundle.discount / 100;
            itemPrice = (product.price || 0) * discountMultiplier;
            console.log(
              `Applied ${bundle.discount}% discount to ${product.name}: $${product.price} -> $${itemPrice}`
            );
          } else {
            console.warn(
              `Bundle ${item.bundleId} not found or has no discount for item ${
                index + 1
              }`
            );
          }
        }

        const itemTotal = itemPrice * (item.quantity || 1);
        total += itemTotal;

        return {
          productId: product._id,
          quantity: item.quantity || 1,
          bundleId: item.bundleId || null, // Include bundleId if present
        };
      })
      .filter(Boolean); // Remove invalid items

    if (validatedItems.length === 0) {
      return res.status(400).json({ message: "No valid items in order" });
    }

    // Validate client-provided total
    const calculatedTotal = Number(total.toFixed(2));
    if (clientTotal && Math.abs(clientTotal - calculatedTotal) > 0.01) {
      console.warn(
        "Client total mismatch:",
        clientTotal,
        calculatedTotal,
        "Difference:",
        Math.abs(clientTotal - calculatedTotal)
      );
      return res.status(400).json({
        message: "Total mismatch between client and server calculation",
        clientTotal,
        serverTotal: calculatedTotal,
      });
    }

    // Handle referral logic
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        const referral = await Referral.findOne({
          referrerId: referrer._id,
          refereeId: req.user.id,
          status: "Pending",
        });
        if (referral) {
          referral.status = "Completed";
          await referral.save();
          referrer.referralDiscount = 10; // 10% discount for referrer
          await referrer.save();
          await Notification.create({
            userId: referrer._id,
            message:
              "Your referral was used! You earned a 10% discount on your next order.",
            read: false,
          });
          await Activity.create({
            userId: referrer._id,
            action: "Referral Completed",
            details: `Referred user ${req.user.name} placed an order.`,
          });
        }
      }
    }

    // Create order
    const order = new Order({
      userId: req.user.id,
      items: validatedItems,
      total: calculatedTotal,
      shippingAddress,
      billingAddress,
      paymentMethod,
      referralCode: referralCode || null,
      pnr: pnr || null,
      statusHistory: [{ status: "Pending", updatedAt: new Date() }],
    });
    await order.save();

    // Populate order for response and email
    const populatedOrder = await Order.findById(order._id)
      .populate("items.productId", "name price")
      .populate("userId", "email");

    // Send notification to user
    await Notification.create({
      userId: req.user.id,
      message: `Order #${order._id} placed successfully!`,
      read: false,
    });

    // Send email with logo
    const user = await User.findById(req.user.id).select("email");
    if (!user) throw new Error("User not found");
    await sendOrderConfirmation(user.email, populatedOrder);

    res.status(201).json(populatedOrder);
  } catch (err) {
    console.error("POST /api/orders error:", err.stack);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

// Get order details (consolidated endpoint)
router.get("/detail/:id", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/detail/:id called with ID:", req.params.id);
    const order = await Order.findById(req.params.id)
      .populate("items.productId", "name price image")
      .populate("userId", "email name");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check authorization with null-safe handling
    if (
      req.user.role !== "admin" &&
      (!order.userId || order.userId._id.toString() !== req.user.id)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (err) {
    console.error("GET /api/orders/detail/:id error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Get order analytics (admin only)
router.get("/analytics", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching order analytics...");
    const orders = await Order.find().populate("items.productId", "name price");
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const productSales = {};
    orders.forEach((order, orderIndex) => {
      console.log(
        `Processing order ${orderIndex + 1}/${orders.length}: ${order._id}`
      );
      order.items.forEach((item, itemIndex) => {
        if (!item.productId) {
          console.warn(
            `Skipping item ${itemIndex + 1} in order ${
              order._id
            }: productId is null or undefined`,
            item
          );
          return;
        }

        const productId = item.productId._id.toString();
        if (!productSales[productId]) {
          productSales[productId] = {
            name: item.productId.name || "Unknown Product",
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[productId].quantity += item.quantity || 0;
        productSales[productId].revenue +=
          (item.quantity || 0) * (item.productId.price || 0);
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const monthlySales = orders.reduce((acc, order) => {
      const date = new Date(order.createdAt || Date.now());
      const key = `${date.getMonth() + 1}/${date.getFullYear()}`;
      if (!acc[key]) {
        acc[key] = {
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          totalOrders: 0,
          totalRevenue: 0,
        };
      }
      acc[key].totalOrders += 1;
      acc[key].totalRevenue += order.total || 0;
      return acc;
    }, {});

    const response = {
      totalOrders,
      totalRevenue,
      topProducts,
      monthlySales: Object.values(monthlySales),
    };

    console.log("Order analytics:", response);
    res.json(response);
  } catch (err) {
    console.error("GET /api/orders/analytics error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Get orders by user ID
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/:userId called with:", req.params.userId);
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    const orders = await Order.find({ userId: req.params.userId }).populate(
      "items.productId",
      "name price image"
    );
    res.json(orders);
  } catch (err) {
    console.error("GET /api/orders/:userId error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Update order status (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id).populate(
      "userId",
      "name email"
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    order.statusHistory.push({ status, updatedAt: new Date() });
    await order.save();

    if (order.userId && order.userId._id) {
      await Notification.create({
        userId: order.userId._id,
        message: `Order #${order._id} status updated to ${status}`,
        read: false,
      });
    } else {
      console.warn(
        `Order ${order._id} has no valid userId for notification`,
        order.userId
      );
    }

    res.json(order);
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Cancel an order (user only)
router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "items.productId",
      "name price image stock"
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (!order.userId || order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (order.status !== "Pending") {
      return res
        .status(400)
        .json({ message: "Only pending orders can be canceled" });
    }

    order.status = "Canceled";
    order.statusHistory.push({ status: "Canceled", updatedAt: new Date() });

    for (const item of order.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId._id);
        if (product) {
          product.stock += item.quantity || 0;
          await product.save();
        }
      }
    }

    const updatedOrder = await order.save();

    await Notification.create({
      userId: req.user.id,
      message: `Your order #${order._id} has been canceled.`,
      read: false,
    });

    res.json(updatedOrder);
  } catch (err) {
    console.error("PUT /api/orders/:id/cancel error:", err.stack);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
