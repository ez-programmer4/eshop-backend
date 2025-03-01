const express = require("express");
const router = express.Router();
const Discount = require("../models/Discount");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Get all discounts (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const discounts = await Discount.find();
    res.json(discounts);
  } catch (err) {
    console.error("GET /api/discounts error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Create a discount (admin only)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const { code, percentage, expiresAt } = req.body;
  if (!code || !percentage) {
    return res
      .status(400)
      .json({ message: "Code and percentage are required" });
  }

  const discount = new Discount({
    code: code.toUpperCase(), // Normalize to uppercase
    percentage,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined, // Ensure valid date
  });

  try {
    const newDiscount = await discount.save();
    res.status(201).json(newDiscount);
  } catch (err) {
    console.error("POST /api/discounts error:", err.stack);
    res.status(400).json({ message: err.message });
  }
});

// Update a discount (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }
    const { code, percentage, expiresAt } = req.body;
    if (code) discount.code = code.toUpperCase(); // Normalize to uppercase
    if (percentage !== undefined) discount.percentage = percentage;
    if (expiresAt) discount.expiresAt = new Date(expiresAt);

    const updatedDiscount = await discount.save();
    res.json(updatedDiscount);
  } catch (err) {
    console.error("PUT /api/discounts/:id error:", err.stack);
    res.status(400).json({ message: err.message });
  }
});

// Delete a discount (admin only)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }
    await discount.deleteOne();
    res.json({ message: "Discount deleted" });
  } catch (err) {
    console.error("DELETE /api/discounts/:id error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Validate discount code (public, with auth)
router.post("/validate", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Discount code is required" });
    }

    const discount = await Discount.findOne({
      code: code.toUpperCase(), // Match case-insensitive
      active: true,
    });

    if (!discount) {
      return res
        .status(400)
        .json({ message: "Invalid or inactive discount code" });
    }

    if (discount.expiresAt && new Date() > discount.expiresAt) {
      discount.active = false;
      await discount.save();
      return res.status(400).json({ message: "Discount code has expired" });
    }

    res.json({ percentage: discount.percentage });
  } catch (err) {
    console.error("POST /api/discounts/validate error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
