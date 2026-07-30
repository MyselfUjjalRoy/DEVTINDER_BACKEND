const socket = require("socket.io");
const crypto = require("crypto");
const Chat = require("../models/chat");
const ConnectionRequest = require("../models/connectionRequest");
const { socketAuth } = require("../middlewares/auth");

const onlineUsers = new Map();

const getSecretRoomId = (userId, targetUserId) => {
  return crypto
    .createHash("sha256")
    .update([userId.toString(), targetUserId.toString()].sort().join("_"))
    .digest("hex");
};

const verifyMatch = async (userId1, userId2) => {
  return ConnectionRequest.findOne({
    $or: [
      { fromUserId: userId1, toUserId: userId2, status: "accepted" },
      { fromUserId: userId2, toUserId: userId1, status: "accepted" },
    ],
  });
};

const initializeSocket = (server) => {
  const io = socket(server, {
    cors: {
      origin: ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    socket.join(userId);
    socket.broadcast.emit("user:online", { userId });

    socket.on("joinChat", async ({ targetUserId }) => {
      try {
        if (!targetUserId) return;
        const roomId = getSecretRoomId(userId, targetUserId);
        socket.join(roomId);

        // mark undelivered messages from the other user as delivered
        const chat = await Chat.findOne({
          participants: { $all: [userId, targetUserId] },
        });
        if (chat) {
          let updated = false;
          for (const msg of chat.messages) {
            if (
              msg.senderId.toString() === targetUserId &&
              msg.status === "sent"
            ) {
              msg.status = "delivered";
              updated = true;
            }
          }
          if (updated) {
            await chat.save();
            io.to(roomId).emit("messagesDelivered", {
              byUserId: userId,
            });
          }
        }
      } catch (err) {
        console.error("Error joining chat room:", err);
      }
    });

    socket.on("sendMessage", async ({ targetUserId, text }) => {
      try {
        if (!targetUserId || !text || !text.trim()) return;
        const roomId = getSecretRoomId(userId, targetUserId);
        const connection = await verifyMatch(userId, targetUserId);
        if (!connection) {
          return socket.emit("error", { message: "Cannot send message to non-connected user" });
        }
        let chat = await Chat.findOne({
          participants: { $all: [userId, targetUserId] },
        });
        if (!chat) {
          chat = new Chat({
            participants: [userId, targetUserId],
            messages: [],
          });
        }
        const newMessage = {
          senderId: userId,
          text: text.trim(),
          status: "sent",
        };
        chat.messages.push(newMessage);
        await chat.save();

        const savedMsg = chat.messages[chat.messages.length - 1];

        // if target user is online, mark as delivered immediately
        if (onlineUsers.has(targetUserId) && onlineUsers.get(targetUserId).size > 0) {
          savedMsg.status = "delivered";
          await chat.save();
        }

        io.to(roomId).emit("messageReceived", {
          _id: savedMsg._id,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          photoURL: socket.user.photoURL,
          senderId: {
            _id: userId,
            firstName: socket.user.firstName,
            lastName: socket.user.lastName,
            photoURL: socket.user.photoURL,
          },
          text: text.trim(),
          status: savedMsg.status,
          createdAt: new Date(),
        });
      } catch (err) {
        console.error("Error sending socket message:", err);
      }
    });

    socket.on("messageRead", async ({ targetUserId }) => {
      try {
        if (!targetUserId) return;
        const roomId = getSecretRoomId(userId, targetUserId);
        const chat = await Chat.findOne({
          participants: { $all: [userId, targetUserId] },
        });
        if (!chat) return;

        const readIds = [];
        for (const msg of chat.messages) {
          if (
            msg.senderId.toString() === targetUserId &&
            msg.status !== "read"
          ) {
            msg.status = "read";
            readIds.push(msg._id);
          }
        }
        if (readIds.length > 0) {
          await chat.save();
          io.to(roomId).emit("messagesRead", {
            readByUserId: userId,
            messageIds: readIds,
          });
        }
      } catch (err) {
        console.error("messageRead error:", err);
      }
    });

    socket.on("disconnect", () => {
      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          io.emit("user:offline", { userId });
        }
      }
    });
  });
};

module.exports = initializeSocket;
