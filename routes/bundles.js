// Import the Express framework and its Router module
const express = require("express");
const router = express.Router();

// Import Mongoose models for Bundle and Product
const Bundle = require("../models/Bundle"); // Assumed to represent a collection of products sold together
const Product = require("../models/Product"); // Assumed to represent individual products

// Import authentication middleware:
// - authMiddleware ensures the user is logged in
// - adminMiddleware ensures the user has admin privileges
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Public endpoint: Get all bundles
router.get("/", async (req, res) => {
  try {
    // Fetch all bundles from the database
    // .populate("products", "name price image category") enriches each bundle with product details
    // (only the fields: name, price, image, and category are included)
    const bundles = await Bundle.find().populate(
      "products",
      "name price image category"
    );

    // Send the bundles as a JSON response
    res.json(bundles);
  } catch (err) {
    // Log the error for debugging purposes
    console.error("GET /api/bundles error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Admin-only endpoint: Create a new bundle
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Extract bundle details from the request body
    const { name, description, products, discount } = req.body;

    // Verify that all provided product IDs exist in the Product collection
    // $in operator checks if each product ID is in the products array
    const productDocs = await Product.find({ _id: { $in: products } });

    // If the number of found products doesn't match the input, some products are invalid
    if (productDocs.length !== products.length) {
      return res
        .status(400)
        .json({ message: "One or more products not found" });
    }

    // Calculate the total price of all products in the bundle
    const totalPrice = productDocs.reduce((sum, p) => sum + p.price, 0);

    // Apply the discount percentage to calculate the final bundle price
    const discountedPrice = totalPrice * (1 - discount / 100);

    // Create a new Bundle instance with the provided and calculated data
    const bundle = new Bundle({
      name,
      description,
      products, // Array of product IDs
      discount, // Discount percentage (e.g., 20 for 20%)
      price: discountedPrice, // Final price after discount
    });

    // Save the bundle to the database
    await bundle.save();

    // Return a 201 Created status with the newly created bundle
    res.status(201).json(bundle);
  } catch (err) {
    // Log the error for debugging
    console.error("POST /api/bundles error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Admin-only endpoint: Update an existing bundle
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Extract updated bundle details from the request body
    const { name, description, products, discount } = req.body;

    // Find the bundle by its ID from the URL parameter
    const bundle = await Bundle.findById(req.params.id);

    // If the bundle doesn't exist, return a 404 Not Found
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    // Verify that all provided product IDs exist in the Product collection
    const productDocs = await Product.find({ _id: { $in: products } });

    // If the number of found products doesn't match the input, some products are invalid
    if (productDocs.length !== products.length) {
      return res
        .status(400)
        .json({ message: "One or more products not found" });
    }

    // Calculate the total price of the updated products
    const totalPrice = productDocs.reduce((sum, p) => sum + p.price, 0);

    // Apply the discount percentage to calculate the new bundle price
    const discountedPrice = totalPrice * (1 - discount / 100);

    // Update the bundle's fields with the new data
    bundle.name = name;
    bundle.description = description;
    bundle.products = products; // Updated array of product IDs
    bundle.discount = discount; // Updated discount percentage
    bundle.price = discountedPrice; // Updated price after discount

    // Save the updated bundle to the database
    await bundle.save();

    // Send the updated bundle as a JSON response
    res.json(bundle);
  } catch (err) {
    // Log the error for debugging
    console.error("PUT /api/bundles/:id error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Admin-only endpoint: Delete a bundle
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Find the bundle by its ID from the URL parameter
    const bundle = await Bundle.findById(req.params.id);

    // If the bundle doesn't exist, return a 404 Not Found
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    // Delete the bundle from the database using deleteOne()
    // Note: .remove() is deprecated in newer Mongoose versions, so deleteOne() is used
    await Bundle.deleteOne({ _id: req.params.id });

    // Send a success message as a JSON response
    res.json({ message: "Bundle deleted successfully" });
  } catch (err) {
    // Log the error for debugging
    console.error("DELETE /api/bundles/:id error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Export the router to be used in the main Express app
module.exports = router;
