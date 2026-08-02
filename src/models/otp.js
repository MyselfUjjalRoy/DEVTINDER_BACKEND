const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    emailId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["verify", "reset"],
      required: true,
    },
    // Only the SHA-256 hash of the OTP is stored, never the plaintext code
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
    used: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Otp", otpSchema);
