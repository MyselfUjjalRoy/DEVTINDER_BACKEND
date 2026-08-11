const express = require("express");
const requestRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const SuperLike = require("../models/superLike");

const sendEmail = require("../utils/sendEmail");
const { getIO } = require("../utils/io");
const { notifyUser } = require("../utils/notifications");
const { toSafeUser, USER_SAFE_DATA } = require("../utils/userSafeData");
const { applySwipeFeedback, SWIPE_ACTIONS } = require("../utils/feedback");
const { markSeen } = require("../utils/feedSeen");
const deckCache = require("../utils/deckCache");
const { FREE_DAILY_SUPERLIKES } = require("../utils/constants");

//IST date string (YYYY-MM-DD) used for daily super connect quota reset
const getTodayIST = () =>
  new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

requestRouter.get("/request/superlike/status", userAuth, async (req, res) => {
  try {
    const today = getTodayIST();
    const used =
      req.user.superLikesDate === today
        ? Number(req.user.superLikesUsed) || 0
        : 0;
    const isPremium = Boolean(req.user.isPremium);
    const remaining = isPremium
      ? null
      : Math.max(0, FREE_DAILY_SUPERLIKES - used);

    res.json({ remaining, isPremium, used, dailyLimit: isPremium ? null : FREE_DAILY_SUPERLIKES });
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

requestRouter.post(
  "/request/superlike/:toUserId",
  userAuth,
  async (req, res) => {
    try {
      const fromUserId = req.user._id;
      const toUserId = req.params.toUserId;

      if (String(fromUserId) === String(toUserId)) {
        return res
          .status(400)
          .json({ message: "Cannot super connect with yourself" });
      }

      const toUser = await User.findById(toUserId);
      if (!toUser) {
        return res.status(404).json({ message: "User not found" });
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
        return res
          .status(400)
          .json({ message: "Connection request already exists" });
      }

      const existingSuperLike = await SuperLike.findOne({
        fromUserId,
        toUserId,
      });
      if (existingSuperLike) {
        return res
          .status(400)
          .json({ message: "You already super connected with this developer" });
      }

      //Daily quota check (resets at midnight IST)
      const today = getTodayIST();
      if (req.user.superLikesDate !== today) {
        req.user.superLikesUsed = 0;
        req.user.superLikesDate = today;
      }

      const isPremium = Boolean(req.user.isPremium);
      const usedToday = Number(req.user.superLikesUsed) || 0;
      if (!isPremium && usedToday >= FREE_DAILY_SUPERLIKES) {
        return res.status(403).json({
          message:
            "Daily super connect limit reached. Come back tomorrow or go premium for unlimited.",
          remaining: 0,
        });
      }

      req.user.superLikesUsed = usedToday + 1;
      await req.user.save();

      await SuperLike.create({ fromUserId, toUserId });

      //A super connect is a strong positive signal — teach the recommender.
      await applySwipeFeedback(req.user, toUser, SWIPE_ACTIONS.LIKE);
      //This card is now decided — keep it out of future feeds (best-effort).
      markSeen(req.user._id, [toUserId]);

      //Deck cache: my seen-pile + preferences changed, and the recipient just
      //got a "starredYou" boost — both feeds must be rebuilt.
      deckCache.invalidate(req.user._id);
      deckCache.invalidate(toUser._id);

      const remaining = isPremium
        ? null
        : Math.max(0, FREE_DAILY_SUPERLIKES - req.user.superLikesUsed);

      await notifyUser({
        userId: toUser._id,
        fromUserId,
        type: "superlike",
        message: `${req.user.firstName}${
          req.user.lastName ? " " + req.user.lastName : ""
        } super connected with your profile! Check their card in your feed. ⭐`,
        link: "/feed",
        actor: toSafeUser(req.user),
      });

      res.json({
        message: `${req.user.firstName} super connected with ${toUser.firstName}`,
        remaining,
        isPremium,
      });
    } catch (err) {
      console.error(err);
      res.status(400).send(err.message);
    }
  },
);

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

      //Feed the recommender: interested = like, ignored = ignore.
      await applySwipeFeedback(
        req.user,
        toUser,
        status === "interested" ? SWIPE_ACTIONS.LIKE : SWIPE_ACTIONS.IGNORE,
      );
      //Either way, this card is decided — don't show it again (best-effort).
      markSeen(req.user._id, [toUserId]);

      //Deck cache: my preferences/seen-pile changed, and the recipient now
      //hides me from their feed — rebuild both decks.
      deckCache.invalidate(req.user._id);
      deckCache.invalidate(toUser._id);

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

      if (status === "interested") {
        await notifyUser({
          userId: toUser._id,
          fromUserId,
          type: "connection_request",
          message: `${req.user.firstName}${
            req.user.lastName ? " " + req.user.lastName : ""
          } sent you a connection request.`,
          link: "/requests",
          actor: toSafeUser(req.user),
        });
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

      await connectionRequest.populate("fromUserId", USER_SAFE_DATA);
      const fromUser = connectionRequest.fromUserId;

      if (status === "accepted") {
        //Accepting is a strong positive signal — teach the recommender.
        await applySwipeFeedback(loggedInUser, fromUser, SWIPE_ACTIONS.LIKE);

        const matchData = {
          requestId: connectionRequest._id,
          users: [toSafeUser(fromUser), toSafeUser(loggedInUser)],
        };

        const io = getIO();
        io.to(fromUser._id.toString()).emit("matched", matchData);
        io.to(loggedInUser._id.toString()).emit("matched", matchData);

        await notifyUser({
          userId: fromUser._id,
          fromUserId: loggedInUser._id,
          type: "match",
          message: `${loggedInUser.firstName}${
            loggedInUser.lastName ? " " + loggedInUser.lastName : ""
          } accepted your connection request. It's a match!`,
          link: "/connections",
          actor: toSafeUser(loggedInUser),
        });
      } else if (status === "rejected") {
        //Rejecting is a negative signal — teach the recommender.
        await applySwipeFeedback(loggedInUser, fromUser, SWIPE_ACTIONS.IGNORE);

        await notifyUser({
          userId: connectionRequest.fromUserId,
          fromUserId: loggedInUser._id,
          type: "connection_rejected",
          message: `${loggedInUser.firstName} declined your connection request.`,
          link: "/feed",
          actor: toSafeUser(loggedInUser),
        });
      }

      //Decided card (accepted OR rejected) — never show it again (best-effort).
      markSeen(loggedInUser._id, [connectionRequest.fromUserId]);

      //Deck cache: my preferences/seen-pile changed, and the other user now
      //hides me from their feed (accepted = connection, rejected = ignored) —
      //rebuild both decks.
      deckCache.invalidate(loggedInUser._id);
      deckCache.invalidate(connectionRequest.fromUserId);

      res.json({ message: "Connection request " + status, data });
    } catch (err) {
      res.status(400).send("ERROR: " + err.message);
    }
  },
);

module.exports = requestRouter;
