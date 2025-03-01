const express = require("express");
const router = express.Router();
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to return this order" });
    }
    if (order.status !== "Delivered") {
      return res
        .status(400)
        .json({ message: "Only delivered orders can be returned" });
    }

    const existingRequest = await ReturnRequest.findOne({
      orderId,
      userId: req.user.id,
    });
    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "Return request already submitted for this order" });
    }

    const returnRequest = new ReturnRequest({
      orderId,
      userId: req.user.id,
      reason,
    });
    await returnRequest.save();

    await Notification.create({
      userId: req.user.id,
      message: `Your return request for order #${orderId} has been submitted.`,
      read: false,
    });

    res.status(201).json({ message: "Return request submitted successfully" });
  } catch (err) {
    console.error("POST /api/return-requests error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/my-requests", authMiddleware, async (req, res) => {
  try {
    const requests = await ReturnRequest.find({ userId: req.user.id }).populate(
      "orderId",
      "_id status total"
    );
    res.json(requests);
  } catch (err) {
    console.error("GET /api/return-requests/my-requests error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const requests = await ReturnRequest.find()
      .populate("orderId", "_id status total")
      .populate("userId", "name email");
    res.json(requests);
  } catch (err) {
    console.error("GET /api/return-requests error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'Approved' or 'Rejected'
    const request = await ReturnRequest.findById(req.params.id);
    if (!request)
      return res.status(404).json({ message: "Return request not found" });

    request.status = status;
    request.updatedAt = Date.now();
    await request.save();

    await Notification.create({
      userId: request.userId,
      message: `Your return request for order #${
        request.orderId
      } has been ${status.toLowerCase()}.`,
      read: false,
    });

    if (status === "Approved") {
      const order = await Order.findById(request.orderId);
      order.status = "Returned"; // This line fails due to enum validation
      await order.save();
    }

    res.json(request);
  } catch (err) {
    console.error("PUT /api/return-requests/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
