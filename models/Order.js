const mongoose = require("mongoose");

const trackingEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  location: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const paymentMethodSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ["card", "telebirr", "mpesa"] },
  last4: { type: String },
  phone: { type: String },
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: { type: Number, required: true },
      bundleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bundle",
        default: null, // Optional, null if not part of a bundle
      },
    },
  ],
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Shipped", "Delivered", "Canceled", "Returned"],
    default: "Pending",
  },
  statusHistory: [
    {
      status: { type: String, required: true },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  billingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  paymentMethod: paymentMethodSchema,
  trackingEvents: [trackingEventSchema],
  referralCode: { type: String }, // Code applied to this order
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", orderSchema);
