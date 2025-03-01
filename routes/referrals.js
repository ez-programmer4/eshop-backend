const express = require("express");
const router = express.Router();
const Referral = require("../models/Referral");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Get all referrals (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate("referrerId", "name email referralCode")
      .populate("refereeId", "name email");
    res.json(referrals);
  } catch (err) {
    console.error("GET /api/referrals error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
