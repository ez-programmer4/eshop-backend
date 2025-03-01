const express = require("express");
const router = express.Router();
const Review = require("../models/Review");

// Submit review
router.post("/", async (req, res) => {
  const review = new Review({
    productId: req.body.productId,
    userId: req.body.userId,
    rating: req.body.rating,
    comment: req.body.comment,
  });
  try {
    const newReview = await review.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get reviews for a product
router.get("/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({
      productId: req.params.productId,
    }).populate("userId", "name");
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
