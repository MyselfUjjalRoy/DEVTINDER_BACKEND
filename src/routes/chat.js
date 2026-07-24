const express = require("express");
const { userAuth } = require("../middlewares/auth");
const mongoose = require("mongoose");
const Chat = require("../models/chat");
const ConnectionRequest = require("../models/connectionRequest");

const chatRouter = express.Router();

chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
  const { targetUserId } = req.params;
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId)
    ) {
      return res.status(400).json({ message: "Invalid user IDs" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

    // Verify connection exists and is accepted
    const connectionExists = await ConnectionRequest.findOne({
      $or: [
        {
          fromUserId: userObjectId,
          toUserId: targetUserObjectId,
          status: "accepted",
        },
        {
          fromUserId: targetUserObjectId,
          toUserId: userObjectId,
          status: "accepted",
        },
      ],
    });

    if (!connectionExists) {
      return res
        .status(400)
        .json({ message: "You are not connected with this user!" });
    }

    // Find existing chat room or create one
    let chat = await Chat.findOne({
      participants: { $all: [userObjectId, targetUserObjectId] },
    })
      .populate({
        path: "messages.senderId",
        select: "firstName lastName photoURL",
      })
      .populate({
        path: "participants",
        select: "firstName lastName photoURL",
      });

    if (!chat) {
      chat = new Chat({
        participants: [userObjectId, targetUserObjectId],
        messages: [],
      });
      await chat.save();
    }

    const totalMessages = chat.messages.length;
    const startIndex = Math.max(0, totalMessages - page * limit);
    const endIndex = totalMessages - (page - 1) * limit;
    const paginatedMessages = chat.messages.slice(startIndex, endIndex);

    res.json({
      messages: paginatedMessages,
      participants: chat.participants,
      hasMore: startIndex > 0,
    });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

module.exports = chatRouter;
