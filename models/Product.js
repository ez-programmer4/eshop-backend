const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  pending: { type: Boolean, default: true }, // New field for moderation
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true },
  image: { type: String, default: "" },
  category: { type: String, required: true },
  stock: { type: Number, required: true },
  lowStockThreshold: { type: Number, default: 5 },
  reviews: [reviewSchema],
});

module.exports = mongoose.model("Product", productSchema);
