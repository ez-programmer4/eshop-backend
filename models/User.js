const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  googleId: { type: String, sparse: true }, // sparse for optional unique indexing
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Removed required: true
  role: { type: String, enum: ["user", "admin"], default: "user" },
  referralCode: { type: String, unique: true }, // Unique code for referrals
  referredUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users referred by this user
  referralDiscount: { type: Number, default: 0 }, // Discount earned from referrals
  createdAt: { type: Date, default: Date.now },
});

// Generate referral code pre-save
userSchema.pre("save", async function (next) {
  if (!this.referralCode) {
    this.referralCode = `${this.name.slice(0, 3).toUpperCase()}${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;
  }
  // Conditional validation: require password only for non-Google users
  if (!this.googleId && !this.password) {
    return next(new Error("Password is required for non-Google users"));
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
