// backend/routes/notifications.js
const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { authMiddleware } = require("../middleware/auth");

// Get unread notifications for the authenticated user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user.id,
      read: false,
    }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });

    notification.read = req.body.read;
    await notification.save();
    res.json(notification);
  } catch (error) {
    console.error("PUT /api/notifications/:id error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
