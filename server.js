const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(
  "sk_test_51Qw6R4KGvURwtTvTSB2Q6dvXJGJvCt6WSjXD8yDGbSCDIwjZzVVPmm2NRSjYgntTXhensfU1Ncuuc3nMqlmShtcA008nKrXkRB"
);
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "https://ethioshop-820b.onrender.com", // Your frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://ethioshop-820b.onrender.com",
    methods: ["GET", "POST"],
  },
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Middleware for Passport
app.use(passport.initialize());

// Passport Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // Add to .env
      clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Add to .env
      callbackURL:
        "https://eshop-backend-e11f.onrender.com/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const User = require("./models/User");
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.create({
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            role: "user",
          });
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const User = require("./models/User");
  const user = await User.findById(id);
  done(null, user);
});

// Routes
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
const paymentRoutes = require("./routes/payment");
const categoryRoutes = require("./routes/categories");

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
app.use("/api/categories", categoryRoutes);
app.use("/api", paymentRoutes);

// Google OAuth Routes
app.get(
  "/api/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id, role: req.user.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );
    res.redirect(
      `https://ethioshop-820b.onrender.com/auth/google?token=${token}`
    );
  }
);

// Test Routes
app.get("/test", (req, res) => res.send("Server is running"));
app.get("/", (req, res) => res.send("Clothing Store Backend is running!"));

// Socket.IO Chat
const activeChats = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.on("joinChat", (userId) => {
    console.log(`User ${userId} joined chat`);
    socket.join(userId);
    if (!activeChats[userId]) activeChats[userId] = [];
    socket.emit("chatHistory", activeChats[userId]);
  });

  socket.on("sendMessage", async ({ userId, message, isAdmin }) => {
    console.log("Received message:", { userId, message, isAdmin });
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

// Stripe Payment Intent
app.post("/api/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Error creating payment intent:", err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// Updated /api/orders Route (example, adjust as needed)
app.post("/api/orders", async (req, res) => {
  const { paymentIntentId, ...orderData } = req.body;

  try {
    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ error: "Payment not completed" });
      }
    }

    const Order = require("./models/Order");
    const order = new Order({
      userId: orderData.userId, // Assuming userId is passed
      ...orderData,
    });
    const savedOrder = await order.save();
    res.status(201).json(savedOrder);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mock Payment Routes
app.post("/api/telebirr/pay", (req, res) => {
  console.log("Telebirr payment:", req.body);
  res.json({ success: true, transactionId: "mock_telebirr_txn_456" });
});

app.post("/api/mpesa/pay", (req, res) => {
  console.log("M-Pesa payment:", req.body);
  res.json({ success: true, transactionId: "mock_mpesa_txn_789" });
});

// Start Server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
