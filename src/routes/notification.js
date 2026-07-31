const express = require("express");
const notificationRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const Notification = require("../models/notification");
const { USER_SAFE_DATA } = require("../utils/userSafeData");

notificationRouter.get("/notifications", userAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const notifications = await Notification.find({
      userId: req.user._id,
    })
      .populate("fromUserId", USER_SAFE_DATA)
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.json({ data: notifications, unreadCount });
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
    res.status(400).send("ERROR: " + err.message);
  }
});

notificationRouter.patch("/notifications/read-all", userAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true } },
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

notificationRouter.patch(
  "/notifications/:notificationId/read",
  userAuth,
  async (req, res) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        {
          _id: req.params.notificationId,
          userId: req.user._id,
        },
        { $set: { isRead: true } },
        { new: true },
      );

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ message: "Notification marked as read", data: notification });
    } catch (err) {
      res.status(400).send("ERROR: " + err.message);
    }
  },
);

module.exports = notificationRouter;
