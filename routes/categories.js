const express = require("express");
const router = express.Router();
const Category = require("../models/Category");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// GET all categories (public)
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// POST add a new category (admin only)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name)
    return res.status(400).json({ message: "Category name is required" });
  try {
    const category = new Category({ name, description });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error("Error adding category:", error);
    res
      .status(400)
      .json({ message: "Error adding category", error: error.message });
  }
});

// PUT update a category (admin only)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name)
    return res.status(400).json({ message: "Category name is required" });
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (error) {
    console.error("Error updating category:", error);
    res
      .status(400)
      .json({ message: "Error updating category", error: error.message });
  }
});

// DELETE a category (admin only)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res
      .status(500)
      .json({ message: "Error deleting category", error: error.message });
  }
});

module.exports = router;
