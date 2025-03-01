const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  refereeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  referralCode: { type: String, required: true },
  status: { type: String, enum: ["Pending", "Completed"], default: "Pending" }, // Completed when referee orders
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Referral", referralSchema);
