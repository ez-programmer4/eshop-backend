// Import the Express framework and its Router module
const express = require("express");
const router = express.Router();

// Import the Discount model (assumed to be a Mongoose model for MongoDB)
const Discount = require("../models/Discount");

// Import authentication middleware:
// - authMiddleware ensures the user is logged in
// - adminMiddleware ensures the user has admin privileges
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Middleware function for logging errors (can be replaced with a proper logger like Winston)
const logError = (route, err) => console.error(`${route} error:`, err.stack);

// Admin-only endpoint: Get all discounts
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Fetch all discounts from the database
    const discounts = await Discount.find();

    // Send the discounts as a JSON response
    res.json(discounts);
  } catch (err) {
    // Log the error with stack trace for debugging
    logError("GET /api/discounts", err);
    // Return a 500 Internal Server Error with a generic message
    res.status(500).json({ message: "Server error fetching discounts" });
  }
});

// Admin-only endpoint: Create a new discount
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  // Extract discount details from the request body
  const { code, percentage, expiresAt } = req.body;

  // Validate input:
  // - code must be provided
  // - percentage must be a number between 0 and 100
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

  // Create a new Discount instance
  const discount = new Discount({
    code: code.toUpperCase().trim(), // Normalize code to uppercase and remove whitespace
    percentage, // Discount percentage (e.g., 20 for 20% off)
    expiresAt: expiresAt ? new Date(expiresAt) : null, // Optional expiration date, null if not provided
  });

  try {
    // Check if a discount with the same code already exists
    const existing = await Discount.findOne({ code: discount.code });
    if (existing) {
      return res.status(400).json({ message: "Discount code already exists" });
    }

    // Save the new discount to the database
    const newDiscount = await discount.save();

    // Return a 201 Created status with the new discount
    res.status(201).json(newDiscount);
  } catch (err) {
    // Log the error for debugging
    logError("POST /api/discounts", err);
    // Return a 400 Bad Request with a specific message
    res.status(400).json({ message: "Failed to create discount" });
  }
});

// Admin-only endpoint: Update an existing discount
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Find the discount by its ID from the URL parameter
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Extract updated fields from the request body (all optional)
    const { code, percentage, expiresAt } = req.body;

    // Update fields if provided in the request
    if (code) discount.code = code.toUpperCase().trim(); // Update code, normalized
    if (
      typeof percentage === "number" &&
      percentage >= 0 &&
      percentage <= 100
    ) {
      discount.percentage = percentage; // Update percentage if valid
    } else if (percentage !== undefined) {
      // If percentage is provided but invalid, return an error
      return res.status(400).json({ message: "Percentage must be 0-100" });
    }
    if (expiresAt !== undefined) {
      // Update expiresAt if provided (null if empty)
      discount.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    // Save the updated discount to the database
    const updatedDiscount = await discount.save();

    // Send the updated discount as a JSON response
    res.json(updatedDiscount);
  } catch (err) {
    // Log the error for debugging
    logError("PUT /api/discounts/:id", err);
    // Return a 400 Bad Request with a specific message
    res.status(400).json({ message: "Failed to update discount" });
  }
});

// Admin-only endpoint: Delete a discount
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Find the discount by its ID from the URL parameter
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Delete the discount from the database
    await discount.deleteOne();

    // Send a success message as a JSON response
    res.json({ message: "Discount deleted" });
  } catch (err) {
    // Log the error for debugging
    logError("DELETE /api/discounts/:id", err);
    // Return a 500 Internal Server Error with a specific message
    res.status(500).json({ message: "Failed to delete discount" });
  }
});

// Public endpoint (with auth): Validate a discount code
router.post("/validate", authMiddleware, async (req, res) => {
  try {
    // Extract the discount code from the request body
    const { code } = req.body;

    // Validate that the code is a non-empty string
    if (!code || typeof code !== "string" || code.trim() === "") {
      return res.status(400).json({ message: "Valid discount code required" });
    }

    // Find an active discount with the provided code (case-insensitive)
    const discount = await Discount.findOne({
      code: code.toUpperCase().trim(),
      active: true, // Only match active discounts
    });

    // If no discount is found, return an error
    if (!discount) {
      return res
        .status(400)
        .json({ message: "Invalid or inactive discount code" });
    }

    // Check if the discount has expired
    if (discount.expiresAt && new Date() > discount.expiresAt) {
      discount.active = false; // Deactivate expired discount
      await discount.save();
      return res.status(400).json({ message: "Discount code expired" });
    }

    // Return the discount percentage if valid
    res.json({ percentage: discount.percentage });
  } catch (err) {
    // Log the error for debugging
    logError("POST /api/discounts/validate", err);
    // Return a 500 Internal Server Error with a generic message
    res.status(500).json({ message: "Server error validating discount" });
  }
});

// Export the router to be used in the main Express app
module.exports = router;
