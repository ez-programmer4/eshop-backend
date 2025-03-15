const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const jwt = require("jsonwebtoken"); // For token verification

// Middleware to verify JWT token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    req.user = decoded; // Attach user info (e.g., userId) to request
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Add item to cart
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity, bundle } = req.body;
    const userId = req.user.id; // From JWT token

    if (!productId || !quantity) {
      return res
        .status(400)
        .json({ message: "Product ID and quantity are required" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const newItem = {
      productId,
      quantity: parseInt(quantity),
      ...(bundle && { bundle }), // Include bundle if provided
    };

    const existingItemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        (bundle ? item.bundle?.bundleId === bundle.bundleId : !item.bundle)
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += newItem.quantity;
    } else {
      cart.items.push(newItem);
    }

    cart.updatedAt = Date.now();
    await cart.save();

    // Return the added/updated item for frontend consistency
    const addedItem =
      cart.items[
        existingItemIndex > -1 ? existingItemIndex : cart.items.length - 1
      ];
    res.status(200).json({ item: addedItem });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's cart
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) {
      return res.status(404).json({ message: "Cart not found", items: [] });
    }
    res.json(cart);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Remove item from cart
router.delete("/remove/:cartItemId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItemId = req.params.cartItemId;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items = cart.items.filter(
      (item) => item._id.toString() !== cartItemId
    );
    await cart.save();
    res.status(200).json({ message: "Item removed from cart" });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update item quantity
router.put("/update/:cartItemId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItemId = req.params.cartItemId;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === cartItemId
    );
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    cart.items[itemIndex].quantity = parseInt(quantity);
    await cart.save();
    res
      .status(200)
      .json({ message: "Quantity updated", item: cart.items[itemIndex] });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Existing endpoint to save entire cart (optional, kept for compatibility)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.id;

    let cart = await Cart.findOne({ userId });
    if (cart) {
      cart.items = items;
      cart.updatedAt = Date.now();
    } else {
      cart = new Cart({ userId, items });
    }

    const savedCart = await cart.save();
    res.status(201).json(savedCart);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
