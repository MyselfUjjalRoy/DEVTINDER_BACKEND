const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      required: true,
      enum: {
        values: [
          "connection_request",
          "connection_accepted",
          "connection_rejected",
          "match",
          "message",
          "superlike",
          "system",
        ],
        message: `{VALUE} is not a valid notification type`,
      },
    },
    message: {
      type: String,
      required: true,
      maxLength: 300,
    },
    link: {
      type: String,
      default: "/",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const NotificationModel = mongoose.model("Notification", notificationSchema);

module.exports = NotificationModel;
