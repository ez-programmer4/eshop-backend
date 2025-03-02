const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const Order = require("../models/Order");
const User = require("../models/User");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Get all products
router.get("/", async (req, res) => {
  try {
    const { category, minPrice, maxPrice, minStock, maxStock, sort, search } =
      req.query;
    let query = {};

    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (minStock || maxStock) {
      query.stock = {};
      if (minStock) query.stock.$gte = Number(minStock);
      if (maxStock) query.stock.$lte = Number(maxStock);
    }
    if (search) query.name = { $regex: new RegExp(search, "i") };

    let products = await Product.find(query).populate("reviews.userId", "name");
    if (sort === "price") products = products.sort((a, b) => a.price - b.price);
    else if (sort === "name")
      products = products.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "stock")
      products = products.sort((a, b) => a.stock - b.stock);

    res.json(products);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get product analytics (review stats)
router.get("/analytics", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching product analytics...");
    const products = await Product.find().select("name reviews");
    const reviewStats = products.map((product) => ({
      name: product.name,
      reviewCount: product.reviews.length,
      averageRating:
        product.reviews.length > 0
          ? (
              product.reviews.reduce((sum, review) => sum + review.rating, 0) /
              product.reviews.length
            ).toFixed(1)
          : 0,
    }));
    console.log("Review stats calculated:", reviewStats.length);
    res.json(reviewStats);
  } catch (err) {
    console.error("GET /api/products/analytics error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Get sales analytics by category
// Get sales analytics by category
router.get(
  "/sales-analytics",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      console.log("Fetching sales analytics by category...");
      const orders = await Order.find().populate(
        "items.productId",
        "category price"
      );
      const categorySales = {};

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
            return; // Skip this item
          }

          const category = item.productId.category;
          if (!category) {
            console.warn(
              `Item ${itemIndex + 1} in order ${order._id} has no category`,
              item.productId
            );
            return; // Skip if category is missing
          }

          if (!categorySales[category]) {
            categorySales[category] = { totalSales: 0, totalRevenue: 0 };
          }
          categorySales[category].totalSales += item.quantity || 0; // Fallback to 0 if quantity is missing
          categorySales[category].totalRevenue +=
            (item.quantity || 0) * (item.productId.price || 0); // Fallback to 0 if price is missing
        });
      });

      const salesByCategory = Object.keys(categorySales).map((category) => ({
        category,
        totalSales: categorySales[category].totalSales,
        totalRevenue: categorySales[category].totalRevenue.toFixed(2),
      }));

      console.log("Sales by category:", salesByCategory);
      res.json(salesByCategory);
    } catch (err) {
      console.error("GET /api/products/sales-analytics error:", err.stack);
      res.status(500).json({ message: err.message });
    }
  }
);

// Get product recommendations (MOVED BEFORE /:id)
router.get("/recommendations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching recommendations for user:", userId);
    let recommendations = [];

    console.log("Fetching orders...");
    const orders = await Order.find({ userId }).populate({
      path: "items.productId",
      select: "name category price image",
    });
    console.log("Orders found:", orders.length);

    const orderedProductIds = new Set();
    const orderedCategories = new Set();
    orders.forEach((order, orderIndex) => {
      console.log(
        `Processing order ${orderIndex + 1}/${orders.length}:`,
        order._id
      );
      order.items.forEach((item, itemIndex) => {
        if (item.productId && item.productId._id) {
          console.log(
            `Item ${itemIndex + 1}: Product ID ${
              item.productId._id
            }, Category ${item.productId.category}`
          );
          orderedProductIds.add(item.productId._id.toString());
          orderedCategories.add(item.productId.category);
        } else {
          console.log(`Item ${itemIndex + 1} has no valid productId:`, item);
        }
      });
    });

    if (orderedCategories.size > 0) {
      console.log("Fetching category-based recommendations...");
      recommendations = await Product.find({
        category: { $in: [...orderedCategories] },
        _id: { $nin: [...orderedProductIds] },
      }).limit(5);
      console.log("Category recommendations:", recommendations.length);
    }

    if (recommendations.length < 5) {
      console.log("Fetching popular products...");
      const existingIds = new Set([
        ...orderedProductIds,
        ...recommendations.map((p) => p._id.toString()),
      ]);
      const popularProducts = await Product.aggregate([
        { $match: { reviews: { $exists: true } } },
        { $unwind: { path: "$reviews", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$_id",
            name: { $first: "$name" },
            category: { $first: "$category" },
            price: { $first: "$price" },
            image: { $first: "$image" },
            avgRating: { $avg: "$reviews.rating" },
            reviewCount: {
              $sum: { $cond: [{ $ifNull: ["$reviews", false] }, 1, 0] },
            },
          },
        },
        { $sort: { reviewCount: -1, avgRating: -1 } },
        { $limit: 5 - recommendations.length },
        { $match: { _id: { $nin: [...existingIds] } } },
      ]);

      console.log("Popular products found:", popularProducts.length);
      const popularProductDocs = popularProducts.map((prod) => ({
        _id: prod._id,
        name: prod.name,
        category: prod.category,
        price: prod.price,
        image: prod.image,
      }));

      recommendations = [...recommendations, ...popularProductDocs];
    }

    console.log("Final recommendations:", recommendations.length);
    res.json(recommendations);
  } catch (err) {
    console.error("GET /api/products/recommendations error:", err.stack);
    res
      .status(500)
      .json({ message: "Failed to fetch recommendations", error: err.message });
  }
});

// Get single product (NOW AFTER /recommendations)
router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    console.log("Fetching product with ID:", productId);
    console.log("Full request URL:", req.originalUrl);

    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      console.log("Invalid ID format:", productId);
      return res.status(400).json({ message: "Invalid product ID format" });
    }

    const product = await Product.findById(productId).populate(
      "reviews.userId",
      "name"
    );
    if (!product) {
      console.log("Product not found for ID:", productId);
      return res.status(404).json({ message: "Product not found" });
    }

    // Calculate rating stats
    const reviews = product.reviews.filter((r) => !r.pending);
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          ).toFixed(1)
        : 0;
    const ratingDistribution = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) ratingDistribution[r.rating - 1]++;
    });

    const response = {
      ...product.toObject(),
      ratingStats: {
        totalReviews,
        averageRating,
        ratingDistribution,
      },
    };
    res.json(response);
  } catch (err) {
    console.error("GET /api/products/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get related products
router.get("/related/:id", async (req, res) => {
  try {
    console.log("GET /api/products/related/:id called with ID:", req.params.id);
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
    })
      .limit(3)
      .populate("reviews.userId", "name");
    res.json(relatedProducts);
  } catch (err) {
    console.error("GET /api/products/related/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Add product (admin only)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const product = new Product(req.body);
  try {
    const newProduct = await product.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add a review
router.post("/:id/reviews", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const review = {
      userId: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment,
      pending: true,
    };

    product.reviews.push(review);
    const updatedProduct = await product.save();
    await updatedProduct.populate("reviews.userId", "name");

    await Notification.create({
      userId: req.user.id,
      message: `Your review for "${product.name}" has been submitted and is awaiting approval.`,
      read: false,
    });

    res
      .status(201)
      .json(updatedProduct.reviews[updatedProduct.reviews.length - 1]);
  } catch (err) {
    console.error("POST /api/products/:id/reviews error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Approve a review (admin only)
router.put(
  "/:productId/reviews/:reviewId/approve",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.productId);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      const review = product.reviews.id(req.params.reviewId);
      if (!review) return res.status(404).json({ message: "Review not found" });

      review.pending = false;
      await product.save();
      await product.populate("reviews.userId", "name");

      await Notification.create({
        userId: review.userId,
        message: `Your review for "${product.name}" has been approved!`,
        read: false,
      });

      res.json(review);
    } catch (err) {
      console.error(
        "PUT /api/products/:productId/reviews/:reviewId/approve error:",
        err
      );
      res.status(500).json({ message: err.message });
    }
  }
);

// Update product (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    Object.assign(product, req.body);
    const updatedProduct = await product.save();

    updatedProduct.variants.forEach((variant) => {
      if (variant.stock < updatedProduct.lowStockThreshold) {
        User.find({ role: "admin" }).then((admins) => {
          const notifications = admins.map((admin) => ({
            userId: admin._id,
            message: `Product "${updatedProduct.name}" variant (${variant.size}, ${variant.color}) stock is low (${variant.stock} units remaining).`,
          }));
          Notification.insertMany(notifications);
        });
      }
    });

    await updatedProduct.populate("reviews.userId", "name");
    res.json(updatedProduct);
  } catch (err) {
    console.error("PUT /api/products/:id error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Delete product (admin only)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Use deleteOne() instead of remove()
    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("DELETE /api/products/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
