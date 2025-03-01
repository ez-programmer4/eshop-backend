const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(
  "sk_test_51Qw6R4KGvURwtTvTSB2Q6dvXJGJvCt6WSjXD8yDGbSCDIwjZzVVPmm2NRSjYgntTXhensfU1Ncuuc3nMqlmShtcA008nKrXkRB"
);
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Your frontend URL
    methods: ["GET", "POST"],
  },
});

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const productRoutes = require("./routes/products");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/orders");
const reviewRoutes = require("./routes/reviews");
const feedbackRoutes = require("./routes/feedback");
const supportRoutes = require("./routes/support");
const userRoutes = require("./routes/users");
const wishlistRoutes = require("./routes/wishlist");
const notificationRoutes = require("./routes/notifications");
const returnRequestRoutes = require("./routes/returnRequests");
const bundleRoutes = require("./routes/bundles");
const referralRoutes = require("./routes/referrals");
const discountRoutes = require("./routes/discounts");

app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/return-requests", returnRequestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/activities", require("./routes/activities"));
app.use("/api/referrals", referralRoutes);
app.use("/api/bundles", bundleRoutes);
app.use("/api/discounts", discountRoutes);
app.get("/test", (req, res) => res.send("Server is running"));
app.get("/", (req, res) => {
  res.send("Clothing Store Backend is running!");
});

const activeChats = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.on("joinChat", (userId) => {
    console.log(`User ${userId} joined chat`); // Debug log
    socket.join(userId);
    if (!activeChats[userId]) activeChats[userId] = [];
    socket.emit("chatHistory", activeChats[userId]);
  });

  socket.on("sendMessage", async ({ userId, message, isAdmin }) => {
    console.log("Received message:", { userId, message, isAdmin }); // Debug log
    const msg = { userId, message, timestamp: new Date(), isAdmin };
    if (!activeChats[userId]) activeChats[userId] = [];
    activeChats[userId].push(msg);

    const Activity = require("./models/Activity");
    await Activity.create({
      userId,
      action: isAdmin ? "Admin Replied" : "User Messaged Support",
      details: message,
    });

    console.log(`Sending to user ${userId}:`, msg);
    io.to(userId).emit("receiveMessage", msg);
    console.log(`Broadcasting to admins:`, { userId, msg });
    io.emit("receiveMessageAdmin", { userId, msg });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.post("/api/create-payment-intent", async (req, res) => {
  const { amount } = req.body; // Amount in cents (e.g., $10.50 = 1050)

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd", // Change to 'etb' if Stripe supports Ethiopian Birr later
      payment_method_types: ["card"],
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Error creating payment intent:", err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// Existing /api/orders route (updated to confirm payment)
app.post("/api/orders", async (req, res) => {
  const { paymentIntentId, ...orderData } = req.body;

  try {
    // Confirm payment intent status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const order = new Order({
      userId: req.user._id, // Assuming auth middleware
      ...orderData,
    });
    const savedOrder = await order.save();
    res.status(201).json(savedOrder);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/telebirr/pay", (req, res) => {
  // Mock Telebirr payment
  console.log("Telebirr payment:", req.body);
  res.json({ success: true, transactionId: "mock_telebirr_txn_456" });
});

app.post("/api/mpesa/pay", (req, res) => {
  // Mock M-Pesa payment
  console.log("M-Pesa payment:", req.body);
  res.json({ success: true, transactionId: "mock_mpesa_txn_789" });
});

server.listen(PORT, () => {
  // Changed from app.listen to server.listen
  console.log(`Server running on port ${PORT}`);
});
