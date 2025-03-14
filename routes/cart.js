// Import the Express framework and its Router module
const express = require("express");
const router = express.Router();

// Import the Cart model (assumed to be a Mongoose model for MongoDB)
const Cart = require("../models/Cart");

// Endpoint: Save or update a user's cart
router.post("/", async (req, res) => {
  try {
    // Extract userId and items from the request body
    // userId: Unique identifier for the user
    // items: Array of cart items (e.g., [{ productId, quantity }])
    const { userId, items } = req.body;

    // Check if a cart already exists for this user
    let cart = await Cart.findOne({ userId });

    if (cart) {
      // If cart exists, update its items and timestamp
      cart.items = items; // Replace the existing items with the new ones
      cart.updatedAt = Date.now(); // Update the last modified timestamp
    } else {
      // If no cart exists, create a new one with the provided userId and items
      cart = new Cart({ userId, items });
    }

    // Save the cart (either updated or new) to the database
    const savedCart = await cart.save();

    // Return a 201 Created status with the saved/updated cart as JSON
    res.status(201).json(savedCart);
  } catch (err) {
    // If an error occurs (e.g., validation failure), return a 400 Bad Request
    // with the error message
    res.status(400).json({ message: err.message });
  }
});

// Endpoint: Get a user's cart by their userId
router.get("/:userId", async (req, res) => {
  try {
    // Fetch the cart for the specified userId from the URL parameter
    // .populate("items.productId") enriches each item with full product details
    // (assuming items is an array of objects with a productId field referencing the Product model)
    const cart = await Cart.findOne({ userId: req.params.userId }).populate(
      "items.productId"
    );

    // If no cart is found, return a 404 Not Found with a message
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Send the cart as a JSON response
    res.json(cart);
  } catch (err) {
    // If an error occurs (e.g., database issue), return a 500 Internal Server Error
    // with the error message
    res.status(500).json({ message: err.message });
  }
});

// Export the router to be used in the main Express app
module.exports = router;
