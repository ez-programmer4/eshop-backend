const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");

// Save/update cart
router.post("/", async (req, res) => {
  try {
    const { userId, items } = req.body;
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

// Get user’s cart
router.get("/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId }).populate(
      "items.productId"
    );
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
