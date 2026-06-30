const express = require("express");
const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const sendEmail = require("../utils/sendEmail");

const requestRouter = express.Router();

requestRouter.post(
  "/request/send/:status/:toUserId",
  userAuth,
  async (req, res) => {
    try {
      const fromUserId = req.user._id;
      const toUserId = req.params.toUserId;
      const status = req.params.status;

      //Validating status
      const allowedStatus = ["ignored", "interested"];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          message: "Invalid Status type " + status,
        });
      }

      //validating toUserId
      const toUser = await User.findById(toUserId);
      if (!toUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      //Check if there is an existing connection Request - bw from & to Ids, or vice versa
      const existingConnectionRequest = await ConnectionRequest.findOne({
        //OR - passing Array of Conditions
        $or: [
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId },
        ],
      });

      if (existingConnectionRequest) {
        return res
          .status(400)
          .send({
            message: "Connection Request already exists on either side.",
          });
      }

      const connectionRequest = new ConnectionRequest({
        fromUserId,
        toUserId,
        status,
      });

      console.log("Before saving connection request");

      const data = await connectionRequest.save();

      console.log("Connection request saved");

      if (status === "interested") {
        try {
          const senderName =
            req.user.firstName + " " + (req.user.lastName || "");
          const recipientEmail = toUser.emailId;
          await sendEmail.run(
            "New connection request from " + senderName,
            senderName + " has sent you a connection request on DevFinder!",
            recipientEmail,
          );
          console.log("email sent");
        } catch (emailErr) {
          console.error("Failed to send instant email notification:", emailErr);
        }
      }

      res.json({
        message: req.user.firstName + " " + status + " " + toUser.firstName,
        data,
      });
    } catch (err) {
      return res.status(400).send("ERROR: " + err.message);
    }
  },
);

requestRouter.post(
  "/request/review/:status/:requestId",
  userAuth,
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      const { status, requestId } = req.params;

      const allowedStatus = ["accepted", "rejected"];

      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ message: "Status not allowed" });
      }

      //find a request in my DB, which ha:
      const connectionRequest = await ConnectionRequest.findOne({
        //requestId
        _id: requestId,
        //toUser should be the logged in user
        toUserId: loggedInUser._id,
        //interested status
        status: "interested",
      });

      if (!connectionRequest) {
        return res
          .status(404)
          .json({ message: "Connection Request not found" });
      }

      connectionRequest.status = status;
      const data = await connectionRequest.save();

      res.json({ message: "Connection Request: " + status, data });
    } catch (err) {
      res.status(400).send("ERROR: " + err.message);
    }
  },
);

module.exports = requestRouter;
