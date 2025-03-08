const express = require("express");
const router = express.Router();
const Wishlist = require("../models/Wishlist");
const { authMiddleware } = require("../middleware/auth");

// Add item to wishlist
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { userId, productId } = req.body;

    if (!userId || !productId) {
      return res
        .status(400)
        .json({ message: "userId and productId are required" });
    }

    const existingItem = await Wishlist.findOne({ userId, productId });
    if (existingItem) {
      return res
        .status(400)
        .json({ message: "Item already exists in the wishlist" });
    }

    const wishlistItem = new Wishlist({ userId, productId });
    const savedItem = await wishlistItem.save();

    res.status(201).json(savedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get wishlist items for a user
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const items = await Wishlist.find({ userId });

    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove item from wishlist
router.delete("/:userId/:productId", authMiddleware, async (req, res) => {
  try {
    const { userId, productId } = req.params;

    if (!userId || !productId) {
      return res
        .status(400)
        .json({ message: "userId and productId are required" });
    }

    const deletedItem = await Wishlist.findOneAndDelete({ userId, productId });

    if (!deletedItem) {
      return res
        .status(404)
        .json({ message: "Item not found in the wishlist" });
    }

    res.json({ message: "Item removed from wishlist", deletedItem });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Clear all wishlist items for a user
router.delete("/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const result = await Wishlist.deleteMany({ userId });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "No wishlist items found for this user" });
    }

    res.json({
      message: "Wishlist cleared",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE /api/wishlist/:userId error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
