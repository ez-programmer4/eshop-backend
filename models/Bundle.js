const mongoose = require("mongoose");

const bundleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  products: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  ],
  discount: { type: Number, required: true, min: 0, max: 100 }, // Percentage discount
  price: { type: Number, required: true }, // Calculated total after discount
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Bundle", bundleSchema);
