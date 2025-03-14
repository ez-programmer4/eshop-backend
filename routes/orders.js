// Import required modules
const express = require("express");
const router = express.Router();

// Import Mongoose models
const Order = require("../models/Order"); // Represents an order
const User = require("../models/User"); // Represents a user
const Referral = require("../models/Referral"); // Tracks referral data
const Activity = require("../models/Activity"); // Logs user activities
const Notification = require("../models/Notification"); // Stores user notifications
const Product = require("../models/Product"); // Represents individual products
const Bundle = require("../models/Bundle"); // Represents product bundles

// Import middleware for authentication and authorization
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Import utility function for sending order confirmation emails
const { sendOrderConfirmation } = require("../utils/email");

// Import Mongoose for ObjectId validation
const mongoose = require("mongoose");

// Admin-only endpoint: Get all orders
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders called"); // Log endpoint access
    // Fetch all orders, populating product and user details
    const orders = await Order.find()
      .populate("items.productId", "name price") // Include product name and price
      .populate("userId", "email"); // Include user email
    res.json(orders); // Send orders as JSON response
  } catch (err) {
    console.error("GET /api/orders error:", err.stack); // Log error with stack trace
    res.status(500).json({ message: err.message }); // Return 500 error
  }
});

// User-specific endpoint: Get the authenticated user's orders
router.get("/my-orders", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/my-orders called for user:", req.user.id); // Log user ID
    // Fetch orders for the authenticated user (req.user.id from authMiddleware)
    const orders = await Order.find({ userId: req.user.id }).populate(
      "items.productId",
      "name price" // Populate product details
    );
    res.json(orders); // Send user's orders as JSON
  } catch (err) {
    console.error("GET /api/orders/my-orders error:", err.stack); // Log error
    res.status(400).json({ message: "Bad request" }); // Return 400 error
  }
});

// Endpoint: Create a new order (authenticated users only)
router.post("/", authMiddleware, async (req, res) => {
  try {
    // Extract order details from request body
    const {
      items,
      shippingAddress,
      billingAddress,
      paymentMethod,
      referralCode,
      pnr,
      total: clientTotal,
      logoUrl, // Optional logo for email branding
    } = req.body;

    // Validate required fields
    if (!items || !shippingAddress || !billingAddress || !paymentMethod) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Fetch products and bundles referenced in items
    const productIds = items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const bundleIds = items
      .filter((item) => item.bundleId)
      .map((item) => item.bundleId);
    const bundles = bundleIds.length
      ? await Bundle.find({ _id: { $in: bundleIds } })
      : [];

    // Calculate total server-side, applying bundle discounts
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
          return null; // Skip invalid items
        }

        let itemPrice = product.price || 0;
        if (item.bundleId) {
          const bundle = bundles.find(
            (b) => b._id.toString() === item.bundleId.toString()
          );
          if (bundle && bundle.discount) {
            // Apply bundle discount (e.g., 15% off)
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
          bundleId: item.bundleId || null, // Include bundleId if applicable
        };
      })
      .filter(Boolean); // Remove null (invalid) items

    if (validatedItems.length === 0) {
      return res.status(400).json({ message: "No valid items in order" });
    }

    // Validate client-provided total against server calculation
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

    // Handle referral logic if a referral code is provided
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        const referral = await Referral.findOne({
          referrerId: referrer._id,
          refereeId: req.user.id,
          status: "Pending",
        });
        if (referral) {
          referral.status = "Completed"; // Mark referral as completed
          await referral.save();
          referrer.referralDiscount = 10; // Grant 10% discount to referrer
          await referrer.save();
          // Notify referrer of earned discount
          await Notification.create({
            userId: referrer._id,
            message:
              "Your referral was used! You earned a 10% discount on your next order.",
            read: false,
          });
          // Log referral activity
          await Activity.create({
            userId: referrer._id,
            action: "Referral Completed",
            details: `Referred user ${req.user.name} placed an order.`,
          });
        }
      }
    }

    // Create new order instance
    const order = new Order({
      userId: req.user.id,
      items: validatedItems,
      total: calculatedTotal,
      shippingAddress,
      billingAddress,
      paymentMethod,
      referralCode: referralCode || null,
      pnr: pnr || null, // Optional PNR (e.g., payment reference)
      statusHistory: [{ status: "Pending", updatedAt: new Date() }],
    });
    await order.save();

    // Populate order for response and email
    const populatedOrder = await Order.findById(order._id)
      .populate("items.productId", "name price")
      .populate("userId", "email");

    // Notify user of order placement
    await Notification.create({
      userId: req.user.id,
      message: `Order #${order._id} placed successfully!`,
      read: false,
    });

    // Send order confirmation email
    const user = await User.findById(req.user.id).select("email");
    if (!user) throw new Error("User not found");
    await sendOrderConfirmation(user.email, populatedOrder);

    res.status(201).json(populatedOrder); // Return created order
  } catch (err) {
    console.error("POST /api/orders error:", err.stack); // Log error
    res.status(500).json({ message: err.message || "Server error" }); // Return 500 error
  }
});

// Endpoint: Get order details by ID (user or admin)
router.get("/detail/:id", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/detail/:id called with ID:", req.params.id); // Log order ID
    // Fetch order with populated product and user details
    const order = await Order.findById(req.params.id)
      .populate("items.productId", "name price image")
      .populate("userId", "email name");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check authorization: admins can view all, users only their own
    if (
      req.user.role !== "admin" &&
      (!order.userId || order.userId._id.toString() !== req.user.id)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this order" });
    }

    res.json(order); // Send order details
  } catch (err) {
    console.error("GET /api/orders/detail/:id error:", err.stack); // Log error
    res.status(500).json({ message: err.message }); // Return 500 error
  }
});

// Admin-only endpoint: Get order analytics
router.get("/analytics", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching order analytics..."); // Log start of analytics
    const orders = await Order.find().populate("items.productId", "name price");

    const totalOrders = orders.length; // Total number of orders
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    ); // Sum of all order totals

    // Calculate product sales stats
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
          return; // Skip invalid items
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

    // Get top 5 products by quantity sold
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Calculate monthly sales
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

    console.log("Order analytics:", response); // Log result
    res.json(response); // Send analytics data
  } catch (err) {
    console.error("GET /api/orders/analytics error:", err.stack); // Log error
    res.status(500).json({ message: err.message }); // Return 500 error
  }
});

// Endpoint: Get orders by user ID (authenticated users)
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    console.log("GET /api/orders/:userId called with:", req.params.userId); // Log user ID
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    // Fetch orders for the specified user
    const orders = await Order.find({ userId: req.params.userId }).populate(
      "items.productId",
      "name price image"
    );
    res.json(orders); // Send orders
  } catch (err) {
    console.error("GET /api/orders/:userId error:", err.stack); // Log error
    res.status(500).json({ message: err.message }); // Return 500 error
  }
});

// Admin-only endpoint: Update order status
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // New status from request body
    const order = await Order.findById(req.params.id).populate(
      "userId",
      "name email"
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status; // Update status
    order.statusHistory.push({ status, updatedAt: new Date() }); // Log status change
    await order.save();

    // Notify user of status update if userId is valid
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

    res.json(order); // Send updated order
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err.stack); // Log error
    res.status(500).json({ message: err.message }); // Return 500 error
  }
});

// User-specific endpoint: Cancel an order
router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    // Fetch order with product details
    const order = await Order.findById(req.params.id).populate(
      "items.productId",
      "name price image stock"
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is authorized to cancel (must be order owner)
    if (!order.userId || order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Only allow cancellation if status is "Pending"
    if (order.status !== "Pending") {
      return res
        .status(400)
        .json({ message: "Only pending orders can be canceled" });
    }

    order.status = "Canceled"; // Update status
    order.statusHistory.push({ status: "Canceled", updatedAt: new Date() }); // Log change

    // Restock products
    for (const item of order.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId._id);
        if (product) {
          product.stock += item.quantity || 0; // Increase stock
          await product.save();
        }
      }
    }

    const updatedOrder = await order.save();

    // Notify user of cancellation
    await Notification.create({
      userId: req.user.id,
      message: `Your order #${order._id} has been canceled.`,
      read: false,
    });

    res.json(updatedOrder); // Send updated order
  } catch (err) {
    console.error("PUT /api/orders/:id/cancel error:", err.stack); // Log error
    res.status(400).json({ message: err.message }); // Return 400 error
  }
});

// Export the router for use in the main Express app
module.exports = router;