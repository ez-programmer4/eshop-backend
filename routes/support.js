const express = require("express");
const router = express.Router();
const Support = require("../models/Support");

// Submit support request
router.post("/", async (req, res) => {
  const support = new Support({
    userId: req.body.userId,
    subject: req.body.subject,
    message: req.body.message,
  });
  try {
    const newSupport = await support.save();
    res.status(201).json(newSupport);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get user support requests
router.get("/:userId", async (req, res) => {
  try {
    const requests = await Support.find({ userId: req.params.userId });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
