const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Referral = require("../models/Referral");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const Activity = require("../models/Activity");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
    });
    await user.save();

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        await Referral.create({
          referrerId: referrer._id,
          refereeId: user._id,
          referralCode,
        });
        referrer.referredUsers.push(user._id);
        await referrer.save();
      }
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("POST /api/users/register error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("POST /api/users/login error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("referredUsers", "name email");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /api/users/profile error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Update profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    const updatedUser = await User.findById(req.user.id)
      .select("-password")
      .populate("referredUsers", "name email");
    res.json(updatedUser);
  } catch (err) {
    console.error("PUT /api/users/profile error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get all users (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Update user by ID (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;
    await user.save();

    res.json(user);
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete own account (any user)
router.delete("/me", authMiddleware, async (req, res) => {
  console.log("DELETE /me called by user:", req.user);
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(req.user.id);
    await Order.deleteMany({ userId: req.user.id });
    await Notification.deleteMany({ userId: req.user.id });
    await Activity.deleteMany({ userId: req.user.id });
    await Referral.deleteMany({
      $or: [{ referrerId: req.user.id }, { refereeId: req.user.id }],
    });
    // Delete user's reviews from all products
    await Product.updateMany(
      { "reviews.userId": req.user.id },
      { $pull: { reviews: { userId: req.user.id } } }
    );
    res.json({ message: "Account and associated data deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/users/me error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete user by ID (admin only)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Use deleteOne() instead of remove()
    await user.deleteOne();
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});
// Add after other routes in routes/users.js
router.put("/apply-referral-discount", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.referralDiscount <= 0) {
      return res
        .status(400)
        .json({ message: "No referral discount available" });
    }
    const discount = user.referralDiscount;
    user.referralDiscount = 0; // Reset after applying
    await user.save();
    await Activity.create({
      userId: req.user.id,
      action: "Referral Discount Applied",
      details: `Applied ${discount}% discount to next order`,
    });
    res.json({ message: "Referral discount applied", discount });
  } catch (err) {
    console.error("PUT /api/users/apply-referral-discount error:", err);
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
