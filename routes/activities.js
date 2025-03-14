// Import the Express framework and its Router module
const express = require("express");
const router = express.Router();

// Import the Activity model (assumed to be a Mongoose model for MongoDB)
const Activity = require("../models/Activity");

// Import authentication middleware:
// - authMiddleware ensures the user is logged in
// - adminMiddleware ensures the user has admin privileges
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Admin-only endpoint: Get all activities in the system
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Fetch all activities from the database
    // .populate("userId", "name email") enriches each activity with user details (name and email)
    // .sort({ timestamp: -1 }) sorts by timestamp in descending order (newest first)
    const activities = await Activity.find()
      .populate("userId", "name email")
      .sort({ timestamp: -1 });

    // Send the activities as a JSON response
    res.json(activities);
  } catch (err) {
    // Log the error for debugging purposes
    console.error("GET /api/activities error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// User-specific endpoint: Get the logged-in user's own activities
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // Fetch activities where userId matches the authenticated user's ID (req.user.id from authMiddleware)
    // .populate("userId", "name email") adds user details to each activity
    // .sort({ timestamp: -1 }) sorts by timestamp in descending order
    // .limit(5) restricts the result to the 5 most recent activities (e.g., for a dashboard)
    const activities = await Activity.find({ userId: req.user.id })
      .populate("userId", "name email")
      .sort({ timestamp: -1 })
      .limit(5);

    // Send the user's activities as a JSON response
    res.json(activities);
  } catch (err) {
    // Log the error for debugging
    console.error("GET /api/activities/me error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Admin-only endpoint: Get activity trends (aggregated data over time)
router.get("/trends", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Use MongoDB aggregation pipeline to process activity data
    const trends = await Activity.aggregate([
      // Step 1: Group activities by date and action type
      {
        $group: {
          _id: {
            // Format timestamp as YYYY-MM-DD
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            action: "$action", // Group by action (e.g., "login", "purchase")
          },
          count: { $sum: 1 }, // Count occurrences of each action per day
        },
      },
      // Step 2: Sort by date and action for consistent ordering
      {
        $sort: { "_id.date": 1, "_id.action": 1 },
      },
      // Step 3: Group by date, collecting all actions into an array
      {
        $group: {
          _id: "$_id.date",
          activities: { $push: { action: "$_id.action", count: "$count" } },
        },
      },
      // Step 4: Sort by date ascending
      {
        $sort: { _id: 1 },
      },
      // Step 5: Limit to the last 30 days of data
      {
        $limit: 30,
      },
    ]);

    // Format the aggregated data into a more readable structure
    const formattedTrends = trends.map((trend) => ({
      date: trend._id, // Date in YYYY-MM-DD format
      // Extract login count, default to 0 if not found
      logins: trend.activities.find((a) => a.action === "login")?.count || 0,
      // Extract purchase count, default to 0 if not found
      purchases:
        trend.activities.find((a) => a.action === "purchase")?.count || 0,
    }));

    // Send the formatted trends as a JSON response
    res.json(formattedTrends);
  } catch (err) {
    // Log the error for debugging
    console.error("GET /api/activities/trends error:", err);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Admin-only endpoint: Get activity heatmap data for the last 30 days
router.get("/heatmap", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Log a message to indicate the endpoint is being accessed
    console.log("Fetching activity heatmap...");

    // Calculate the date 30 days ago from today
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch activities from the last 30 days
    const activities = await Activity.find({
      timestamp: { $gte: thirtyDaysAgo }, // Greater than or equal to 30 days ago
    });

    // Initialize an object to store heatmap data
    const heatmapData = {};

    // Process each activity to build the heatmap
    activities.forEach((activity) => {
      // Extract the date in YYYY-MM-DD format from the timestamp
      const date = activity.timestamp.toISOString().split("T")[0];

      // If the date isn't in heatmapData yet, initialize it
      if (!heatmapData[date]) {
        heatmapData[date] = { logins: 0, purchases: 0 };
      }

      // Increment counters based on the action type
      if (activity.action === "login") heatmapData[date].logins += 1;
      if (activity.action === "purchase") heatmapData[date].purchases += 1;
    });

    // Convert the heatmapData object into an array and sort by date
    const result = Object.keys(heatmapData)
      .map((date) => ({
        date,
        logins: heatmapData[date].logins,
        purchases: heatmapData[date].purchases,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Log the number of days with data for debugging
    console.log("Heatmap data:", result.length);

    // Send the heatmap data as a JSON response
    res.json(result);
  } catch (err) {
    // Log the full error stack for detailed debugging
    console.error("GET /api/activities/heatmap error:", err.stack);
    // Return a 500 Internal Server Error with the error message
    res.status(500).json({ message: err.message });
  }
});

// Export the router to be used in the main Express app
module.exports = router;
