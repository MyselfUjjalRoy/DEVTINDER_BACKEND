const express = require("express");
const requestRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");

const sendEmail = require("../utils/sendEmail");

requestRouter.post(
  "/request/send/:status/:toUserId",
  userAuth,
  async (req, res) => {
    try {
      console.log("\n==============================");
      console.log("Connection Request API Called");
      console.log("==============================");

      const fromUserId = req.user._id;
      const toUserId = req.params.toUserId;
      const status = req.params.status;

      console.log("Sender:", req.user.firstName);
      console.log("Receiver ID:", toUserId);
      console.log("Status:", status);

      const allowedStatus = ["ignored", "interested"];

      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          message: "Invalid status",
        });
      }

      const toUser = await User.findById(toUserId);

      if (!toUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const existingConnectionRequest = await ConnectionRequest.findOne({
        $or: [
          { fromUserId, toUserId },
          {
            fromUserId: toUserId,
            toUserId: fromUserId,
          },
        ],
      });

      if (existingConnectionRequest) {
        console.log("Connection Request Already Exists");

        return res.status(400).json({
          message: "Connection Request Already Exists",
        });
      }

      const connectionRequest = new ConnectionRequest({
        fromUserId,
        toUserId,
        status,
      });

      const data = await connectionRequest.save();

      console.log("Connection Request Saved");

      if (status === "interested") {
        const senderName = req.user.firstName + " " + (req.user.lastName || "");

        // SANDBOX: send to your verified Gmail for testing
        // PRODUCTION: uncomment the line below after SES production access is approved
        // const recipientEmail = toUser.emailId;
        const recipientEmail = "royu99099@gmail.com";

        console.log("[Email] Preparing to send email:", {
          subject: `New connection request from ${senderName}`,
          body: `${senderName} has sent you a connection request on DevTinder!`,
          to: recipientEmail,
        });
        try {
          await sendEmail.run(
            `New connection request from ${senderName}`,
            `${senderName} has sent you a connection request on DevTinder!`,
            recipientEmail,
          );
          console.log("[Email] Email sent successfully");
        } catch (emailErr) {
          console.error("[Email] Failed to send email:", emailErr);
        }
      }

      res.json({
        message: `${req.user.firstName} ${status} ${toUser.firstName}`,
        data,
      });
    } catch (err) {
      console.error(err);

      res.status(400).send(err.message);
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
        return res.status(400).json({ messaage: "Status not allowed!" });
      }

      const connectionRequest = await ConnectionRequest.findOne({
        _id: requestId,
        toUserId: loggedInUser._id,
        status: "interested",
      });
      if (!connectionRequest) {
        return res
          .status(404)
          .json({ message: "Connection request not found" });
      }

      connectionRequest.status = status;

      const data = await connectionRequest.save();

      res.json({ message: "Connection request " + status, data });
    } catch (err) {
      res.status(400).send("ERROR: " + err.message);
    }
  },
);

module.exports = requestRouter;
