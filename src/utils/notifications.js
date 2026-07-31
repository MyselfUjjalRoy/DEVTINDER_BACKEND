const Notification = require("../models/notification");
const { getIO } = require("./io");

const notifyUser = async ({ userId, fromUserId, type, message, link, actor }) => {
  try {
    const notification = await Notification.create({
      userId,
      fromUserId: fromUserId || null,
      type,
      message,
      link: link || "/",
    });

    const io = getIO();
    io.to(userId.toString()).emit("notification:new", {
      _id: notification._id,
      type: notification.type,
      message: notification.message,
      link: notification.link,
      fromUserId: notification.fromUserId
        ? notification.fromUserId.toString()
        : null,
      actor: actor || null,
      isRead: false,
      createdAt: notification.createdAt,
    });

    return notification;
  } catch (err) {
    console.error("Failed to notify user:", err);
    return null;
  }
};

module.exports = { notifyUser };
