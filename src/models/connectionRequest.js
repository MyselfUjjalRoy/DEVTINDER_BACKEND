const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema(
  {
    //fromUserId is Id of the user from the User table
    fromUserId: {
      ref: "User", //reference to the User collection
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    toUserId: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ["ignored", "interested", "accepted", "rejected"],
        message: `{VALUE} is incorrect status type`,
      },
    },
  },
  { timestamps: true },
);

//COMPOUND INDEX
//1 -> Ascending Order, -1 -> Descending Order //changing the order of how MongoDB stores data in the DB
connectionRequestSchema.index({ fromUserId: 1, toUserId: 1 });

//pre middleware - (like an event handler)
// will be called before a connectionRequest will be saved - basically 'pre' save
//can do validations & checks here
connectionRequestSchema.pre("save", function (next) {
  const connectionRequest = this;

  //check if fromUserId is same as toUserId
  if (connectionRequest.fromUserId.equals(connectionRequest.toUserId)) {
    throw new Error("Cannot send connection request to self");
  }

  //very important to call next();
  next();
});

const ConnectionRequestModel = new mongoose.model(
  "ConnectionRequest",
  connectionRequestSchema,
);

module.exports = ConnectionRequestModel;
