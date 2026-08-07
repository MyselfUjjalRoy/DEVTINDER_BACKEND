const mongoose = require("mongoose");

const superLikeSchema = new mongoose.Schema(
  {
    //fromUserId is the user who sent the super connect
    fromUserId: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    toUserId: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true },
);

//A user can super connect with another user only once
superLikeSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });

//Feed boost query: look up who super connected with me recently
superLikeSchema.index({ toUserId: 1, createdAt: -1 });

superLikeSchema.pre("save", function (next) {
  const superLike = this;

  if (superLike.fromUserId.equals(superLike.toUserId)) {
    throw new Error("Cannot super connect with yourself");
  }

  next();
});

const SuperLikeModel = new mongoose.model("SuperLike", superLikeSchema);

module.exports = SuperLikeModel;
