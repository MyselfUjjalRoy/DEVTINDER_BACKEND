const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    paymentId: {
      type: String,
    },
    productId: {
      type: String,
    },
    priceId: {
      type: String,
    },
    membershipType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: "created",
    },
    amount: {
      type: Number,
    },
    currency: {
      type: String,
      default: "inr",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
