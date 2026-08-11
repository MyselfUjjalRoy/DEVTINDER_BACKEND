const express = require("express");
const notificationRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const Notification = require("../models/notification");
const { USER_SAFE_DATA } = require("../utils/userSafeData");

notificationRouter.get("/notifications", userAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    //Tray shows UNREAD notifications only — once a notification is read it is
    //removed from the tray (real-world inbox behavior). Read items stay in the
    //DB as history but never come back into the bell.
    const query = { userId: req.user._id, dismissed: false, isRead: false };
    const notifications = await Notification.find(query)
      .populate("fromUserId", USER_SAFE_DATA)
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments(query);

    res.json({ data: notifications, unreadCount });
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
    res.status(400).send("ERROR: " + err.message);
  }
});

// "Mark all read" — clears the unread badge AND dismisses everything from the
// tray (like real apps). Soft-deletes so cleared items never resurface.
notificationRouter.patch("/notifications/read-all", userAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true, dismissed: true } },
    );

    res.json({ message: "All notifications marked as read and cleared" });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

// "Clear all" — dismisses every notification, read or not.
notificationRouter.delete("/notifications", userAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id },
      { $set: { dismissed: true } },
    );

    res.json({ message: "All notifications cleared" });
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

// Dismiss a single notification from the tray (soft delete — stays in DB,
// filtered from /notifications so it never comes back).
notificationRouter.delete(
  "/notifications/:notificationId",
  userAuth,
  async (req, res) => {
    try {
      const result = await Notification.updateOne(
        {
          _id: req.params.notificationId,
          userId: req.user._id,
        },
        { $set: { dismissed: true } },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ message: "Notification dismissed" });
    } catch (err) {
      res.status(400).send("ERROR: " + err.message);
    }
  },
);

module.exports = notificationRouter;
