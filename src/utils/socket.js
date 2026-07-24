const socket = require("socket.io");
const crypto = require("crypto");
const Chat = require("../models/chat");
const ConnectionRequest = require("../models/connectionRequest");
const { socketAuth } = require("../middlewares/auth");

// Secret room ID generator (SHA256 of sorted user IDs)
const getSecretRoomId = (userId, targetUserId) => {
  return crypto
    .createHash("sha256")
    .update([userId.toString(), targetUserId.toString()].sort().join("_"))
    .digest("hex");
};

const initializeSocket = (server) => {
  const io = socket(server, {
    cors: {
      origin: ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    },
  });

  // Apply JWT authentication middleware
  io.use(socketAuth);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.user?.firstName} (${socket.id})`);

    // 1. Join Chat Room Event
    socket.on("joinChat", async ({ targetUserId }) => {
      try {
        if (!targetUserId) return;
        const userId = socket.user._id.toString();
        const roomId = getSecretRoomId(userId, targetUserId);

        socket.join(roomId);
        console.log(`${socket.user.firstName} joined chat room: ${roomId}`);
      } catch (err) {
        console.error("Error joining chat room:", err);
      }
    });

    // 2. Send Message Event
    socket.on("sendMessage", async ({ targetUserId, text }) => {
      try {
        if (!targetUserId || !text || !text.trim()) return;

        const currentUserId = socket.user._id.toString();
        const roomId = getSecretRoomId(currentUserId, targetUserId);

        // Verify connection exists and is accepted
        const connection = await ConnectionRequest.findOne({
          $or: [
            { fromUserId: currentUserId, toUserId: targetUserId, status: "accepted" },
            { fromUserId: targetUserId, toUserId: currentUserId, status: "accepted" },
          ],
        });

        if (!connection) {
          return socket.emit("error", { message: "Cannot send message to non-connected user" });
        }

        // Find or create chat document
        let chat = await Chat.findOne({
          participants: { $all: [currentUserId, targetUserId] },
        });

        if (!chat) {
          chat = new Chat({
            participants: [currentUserId, targetUserId],
            messages: [],
          });
        }

        const newMessage = {
          senderId: currentUserId,
          text: text.trim(),
        };

        chat.messages.push(newMessage);
        await chat.save();

        // Emit message to everyone in the room
        io.to(roomId).emit("messageReceived", {
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          photoURL: socket.user.photoURL,
          senderId: {
            _id: currentUserId,
            firstName: socket.user.firstName,
            lastName: socket.user.lastName,
            photoURL: socket.user.photoURL,
          },
          text: text.trim(),
          createdAt: new Date(),
        });
      } catch (err) {
        console.error("Error sending socket message:", err);
      }
    });

    // 3. Disconnect Event
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user?.firstName}`);
    });
  });
};

module.exports = initializeSocket;
