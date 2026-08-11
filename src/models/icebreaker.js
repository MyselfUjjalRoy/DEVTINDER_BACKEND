/**
 * icebreaker.js — one generated opener per matched pair.
 *
 * The pair is stored canonically (userA < userB by ObjectId), so the same
 * document is served to both users and each pair only ever generates once.
 * Created lazily on first request — never on the accept/matching hot path —
 * and kept forever so replays are free.
 */

const mongoose = require("mongoose");

const icebreakerSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    source: {
      type: String,
      enum: ["ai", "fallback"],
      default: "ai",
    },
  },
  { timestamps: true },
);

// Enforces one icebreaker per unordered pair and makes lookups index-scanned.
icebreakerSchema.index({ userA: 1, userB: 1 }, { unique: true });

// Converts a pair of ids into the canonical (userA, userB) ordering.
icebreakerSchema.statics.canonicalPair = (id1, id2) => {
  const a = String(id1);
  const b = String(id2);
  return a <= b ? [a, b] : [b, a];
};

module.exports = mongoose.model("Icebreaker", icebreakerSchema);
