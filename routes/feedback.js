const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const { authMiddleware } = require("../middleware/auth");

// Submit feedback
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { orderId, rating, comment } = req.body;
    const feedback = new Feedback({
      userId: req.user.id,
      orderId,
      rating,
      comment,
    });
    await feedback.save();
    res.status(201).json({ message: "Feedback submitted successfully" });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Get feedback for an order
router.get("/order/:orderId", authMiddleware, async (req, res) => {
  try {
    const feedback = await Feedback.findOne({
      orderId: req.params.orderId,
      userId: req.user.id,
    });
    res.json(feedback || {});
  } catch (err) {
    console.error("GET /api/feedback/order/:orderId error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
