const express = require("express");
const router = express.Router();
const Bundle = require("../models/Bundle");
const Product = require("../models/Product");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Get all bundles
router.get("/", async (req, res) => {
  try {
    const bundles = await Bundle.find().populate(
      "products",
      "name price image category"
    );
    res.json(bundles);
  } catch (err) {
    console.error("GET /api/bundles error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Create a bundle (admin only)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, products, discount } = req.body;
    const productDocs = await Product.find({ _id: { $in: products } });
    if (productDocs.length !== products.length) {
      return res
        .status(400)
        .json({ message: "One or more products not found" });
    }

    const totalPrice = productDocs.reduce((sum, p) => sum + p.price, 0);
    const discountedPrice = totalPrice * (1 - discount / 100);

    const bundle = new Bundle({
      name,
      description,
      products,
      discount,
      price: discountedPrice,
    });
    await bundle.save();

    res.status(201).json(bundle);
  } catch (err) {
    console.error("POST /api/bundles error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Update a bundle (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, products, discount } = req.body;
    const bundle = await Bundle.findById(req.params.id);
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    const productDocs = await Product.find({ _id: { $in: products } });
    if (productDocs.length !== products.length) {
      return res
        .status(400)
        .json({ message: "One or more products not found" });
    }

    const totalPrice = productDocs.reduce((sum, p) => sum + p.price, 0);
    const discountedPrice = totalPrice * (1 - discount / 100);

    bundle.name = name;
    bundle.description = description;
    bundle.products = products;
    bundle.discount = discount;
    bundle.price = discountedPrice;
    await bundle.save();

    res.json(bundle);
  } catch (err) {
    console.error("PUT /api/bundles/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete a bundle (admin only)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const bundle = await Bundle.findById(req.params.id);
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    // Use deleteOne() instead of remove()
    await Bundle.deleteOne({ _id: req.params.id });
    res.json({ message: "Bundle deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/bundles/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
