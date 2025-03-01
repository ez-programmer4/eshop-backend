const express = require("express");
const router = express.Router();
const Activity = require("../models/Activity");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Admin-only: Get all activities
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("userId", "name email")
      .sort({ timestamp: -1 });
    res.json(activities);
  } catch (err) {
    console.error("GET /api/activities error:", err);
    res.status(500).json({ message: err.message });
  }
});

// User-specific: Get own activities
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const activities = await Activity.find({ userId: req.user.id })
      .populate("userId", "name email")
      .sort({ timestamp: -1 })
      .limit(5); // Limit to last 5 for user dashboard
    res.json(activities);
  } catch (err) {
    console.error("GET /api/activities/me error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Admin-only: Get activity trends
router.get("/trends", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const trends = await Activity.aggregate([
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            action: "$action",
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.date": 1, "_id.action": 1 },
      },
      {
        $group: {
          _id: "$_id.date",
          activities: { $push: { action: "$_id.action", count: "$count" } },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $limit: 30,
      },
    ]);

    const formattedTrends = trends.map((trend) => ({
      date: trend._id,
      logins: trend.activities.find((a) => a.action === "login")?.count || 0,
      purchases:
        trend.activities.find((a) => a.action === "purchase")?.count || 0,
    }));

    res.json(formattedTrends);
  } catch (err) {
    console.error("GET /api/activities/trends error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/heatmap", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching activity heatmap...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activities = await Activity.find({
      timestamp: { $gte: thirtyDaysAgo },
    });
    const heatmapData = {};

    activities.forEach((activity) => {
      const date = activity.timestamp.toISOString().split("T")[0]; // YYYY-MM-DD
      if (!heatmapData[date]) {
        heatmapData[date] = { logins: 0, purchases: 0 };
      }
      if (activity.action === "login") heatmapData[date].logins += 1;
      if (activity.action === "purchase") heatmapData[date].purchases += 1;
    });

    const result = Object.keys(heatmapData)
      .map((date) => ({
        date,
        logins: heatmapData[date].logins,
        purchases: heatmapData[date].purchases,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log("Heatmap data:", result.length);
    res.json(result);
  } catch (err) {
    console.error("GET /api/activities/heatmap error:", err.stack);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
