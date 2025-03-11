const express = require("express");
const router = express.Router();
const Discount = require("../models/Discount");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Middleware for logging (optional, replace with your logger if needed)
const logError = (route, err) => console.error(`${route} error:`, err.stack);

// Get all discounts (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const discounts = await Discount.find();
    res.json(discounts);
  } catch (err) {
    logError("GET /api/discounts", err);
    res.status(500).json({ message: "Server error fetching discounts" });
  }
});

// Create a discount (admin only)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const { code, percentage, expiresAt } = req.body;

  if (
    !code ||
    typeof percentage !== "number" ||
    percentage < 0 ||
    percentage > 100
  ) {
    return res
      .status(400)
      .json({ message: "Valid code and percentage (0-100) required" });
  }

  const discount = new Discount({
    code: code.toUpperCase().trim(),
    percentage,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  try {
    const existing = await Discount.findOne({ code: discount.code });
    if (existing) {
      return res.status(400).json({ message: "Discount code already exists" });
    }
    const newDiscount = await discount.save();
    res.status(201).json(newDiscount);
  } catch (err) {
    logError("POST /api/discounts", err);
    res.status(400).json({ message: "Failed to create discount" });
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
    if (code) discount.code = code.toUpperCase().trim();
    if (
      typeof percentage === "number" &&
      percentage >= 0 &&
      percentage <= 100
    ) {
      discount.percentage = percentage;
    } else if (percentage !== undefined) {
      return res.status(400).json({ message: "Percentage must be 0-100" });
    }
    if (expiresAt !== undefined)
      discount.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const updatedDiscount = await discount.save();
    res.json(updatedDiscount);
  } catch (err) {
    logError("PUT /api/discounts/:id", err);
    res.status(400).json({ message: "Failed to update discount" });
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
    logError("DELETE /api/discounts/:id", err);
    res.status(500).json({ message: "Failed to delete discount" });
  }
});

// Validate discount code (public, with auth)
router.post("/validate", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string" || code.trim() === "") {
      return res.status(400).json({ message: "Valid discount code required" });
    }

    const discount = await Discount.findOne({
      code: code.toUpperCase().trim(),
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
      return res.status(400).json({ message: "Discount code expired" });
    }

    res.json({ percentage: discount.percentage });
  } catch (err) {
    logError("POST /api/discounts/validate", err);
    res.status(500).json({ message: "Server error validating discount" });
  }
});

module.exports = router;
