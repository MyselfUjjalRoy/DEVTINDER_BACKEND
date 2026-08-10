const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    emoji: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactions: [reactionSchema],
    attachment: {
      url: { type: String },
      type: { type: String },
      name: { type: String },
      size: { type: Number },
    },
    // WhatsApp-style reply. This is a DENORMALIZED snapshot of the quoted
    // message, captured at send time, so a reply still renders even if the
    // original message is later deleted or cleared.
    replyTo: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat.messages",
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      senderName: {
        type: String,
        maxLength: 100,
      },
      text: {
        type: String,
        default: "",
      },
      attachment: {
        type: { type: String },
        name: { type: String },
        url: { type: String },
      },
      isDeleted: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    messages: [messageSchema],
    clearedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);
