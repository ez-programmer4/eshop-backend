const express = require("express");
const router = express.Router();
const stripe = require("stripe")(
  "sk_test_51Qw6R4KGvURwtTvT...your-secret-key..."
);
const { authMiddleware } = require("../middleware/auth");

// Stripe Payment Intent
router.post("/create-payment-intent", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ message: "Valid amount required" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Convert to cents
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("POST /api/create-payment-intent error:", err.stack);
    res.status(500).json({ message: "Failed to create payment intent" });
  }
});

// Telebirr Payment (Stub)
router.post("/telebirr/pay", authMiddleware, async (req, res) => {
  try {
    const { amount, phone, pnr } = req.body;
    if (!amount || !phone || !pnr) {
      return res
        .status(400)
        .json({ message: "Amount, phone, and PNR required" });
    }
    // TODO: Integrate with Telebirr API
    console.log(
      `Telebirr payment requested: ${amount} for ${phone}, PNR: ${pnr}`
    );
    res.json({ message: "Telebirr payment initiated (stub)" });
  } catch (err) {
    console.error("POST /api/telebirr/pay error:", err.stack);
    res.status(500).json({ message: "Telebirr payment failed" });
  }
});

// M-Pesa Payment (Stub)
router.post("/mpesa/pay", authMiddleware, async (req, res) => {
  try {
    const { amount, phone, pnr } = req.body;
    if (!amount || !phone || !pnr) {
      return res
        .status(400)
        .json({ message: "Amount, phone, and PNR required" });
    }
    // TODO: Integrate with M-Pesa API
    console.log(
      `M-Pesa payment requested: ${amount} for ${phone}, PNR: ${pnr}`
    );
    res.json({ message: "M-Pesa payment initiated (stub)" });
  } catch (err) {
    console.error("POST /api/mpesa/pay error:", err.stack);
    res.status(500).json({ message: "M-Pesa payment failed" });
  }
});

module.exports = router;
