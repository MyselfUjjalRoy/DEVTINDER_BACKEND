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

    if (chat.clearedFor && chat.clearedFor.some((id) => id.toString() === userId)) {
      return res.json({
        messages: [],
        participants: chat.participants,
        hasMore: false,
      });
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

chatRouter.get("/chats/unread", userAuth, async (req, res) => {
  const userId = req.user._id;

  try {
    const chats = await Chat.find({
      participants: userId,
    });

    const unreadMap = {};
    const lastActivityMap = {};
    for (const chat of chats) {
      const partnerId = chat.participants.find(
        (p) => p.toString() !== userId.toString()
      );
      if (!partnerId) continue;

      const visibleMessages = chat.messages.filter(
        (m) => !m.deletedFor.includes(userId)
      );

      const count = visibleMessages.filter(
        (m) =>
          m.senderId.toString() === partnerId.toString() &&
          m.status !== "read"
      ).length;

      if (count > 0) {
        unreadMap[partnerId.toString()] = count;
      }

      const last = visibleMessages[visibleMessages.length - 1];
      if (last) {
        let preview;
        if (last.isDeleted) {
          preview = "This message was deleted";
        } else if (last.attachment?.type === "image") {
          preview = "📷 Photo";
        } else if (last.attachment?.type === "audio") {
          preview = "🎤 Voice message";
        } else if (last.attachment) {
          preview = "📎 " + (last.attachment.name || "File");
        } else {
          preview = last.text || "";
        }
        lastActivityMap[partnerId.toString()] = {
          lastActivityAt: last.createdAt,
          lastText: preview,
          lastSenderId: last.senderId.toString(),
        };
      }
    }

    res.json({ unreadMap, lastActivityMap });
  } catch (error) {
    console.error("Error fetching unread counts:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

chatRouter.get("/chat/:targetUserId/search", userAuth, async (req, res) => {
  const { targetUserId } = req.params;
  const userId = req.user._id;
  const query = req.query.q;

  if (!query || !query.trim()) {
    return res.status(400).json({ message: "Search query is required" });
  }

  try {
    const chat = await Chat.findOne({
      participants: { $all: [userId, targetUserId] },
    }).populate({
      path: "messages.senderId",
      select: "firstName lastName photoURL",
    });

    if (!chat) {
      return res.json({ messages: [] });
    }

    const regex = new RegExp(query.trim(), "i");
    const matching = chat.messages.filter(
      (m) => !m.isDeleted && m.text && regex.test(m.text)
    );

    res.json({ messages: matching });
  } catch (error) {
    console.error("Error searching chat:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

chatRouter.delete("/chat/:targetUserId", userAuth, async (req, res) => {
  const { targetUserId } = req.params;
  const userId = req.user._id;

  try {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId)
    ) {
      return res.status(400).json({ message: "Invalid user IDs" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

    const chat = await Chat.findOne({
      participants: { $all: [userObjectId, targetUserObjectId] },
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    await Chat.findByIdAndUpdate(chat._id, {
      $addToSet: { clearedFor: userObjectId },
    });

    res.json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = chatRouter;
