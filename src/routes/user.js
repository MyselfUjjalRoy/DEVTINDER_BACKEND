const express = require("express");
const mongoose = require("mongoose");
const userRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const SuperLike = require("../models/superLike");
const { toSafeUser } = require("../utils/userSafeData");
const { rankFeed } = require("../utils/feedRanking");
const { filterSeen } = require("../utils/feedSeen");
const {
  extractLeetcodeUsername,
  fetchLeetCodeStats,
} = require("../utils/leetcode");
const deckCache = require("../utils/deckCache");
const { generateMatchReasons } = require("../utils/matchReasons");

const USER_SAFE_DATA =
  "firstName lastName photoURL photos age dob gender about skills " +
  "location hobbies likes dislikes isStudent education work " +
  "codingProfiles github linkedin portfolio resumeURL membershipType isPremium";

//Get all the 'pending' connection requests for the logged in user
userRouter.get("/user/requests/received", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequest.find({
      toUserId: loggedInUser._id,
      status: "interested",
    }).populate("fromUserId", USER_SAFE_DATA);

    //Flag requests from devs who also super connected with me
    const superLikesToMe = await SuperLike.find({
      toUserId: loggedInUser._id,
    }).select("fromUserId");

    const superFromIds = new Set(
      superLikesToMe.map((s) => s.fromUserId.toString()),
    );

    const data = connectionRequests.map((r) => {
      const obj = r.toObject();
      obj.superConnect = superFromIds.has(
        String(obj.fromUserId?._id || obj.fromUserId || ""),
      );
      return obj;
    });

    res.json({ message: "Data Sent Successfully", data });
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

//View any user's full profile with the viewer's relationship to them
userRouter.get("/user/profile/:userId", userAuth, async (req, res) => {
  try {
    const viewerId = req.user._id;
    const targetId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    let relationship = "stranger";
    let requestId = null;
    let superConnect = false;

    if (targetId.toString() === viewerId.toString()) {
      relationship = "self";
    } else {
      const request = await ConnectionRequest.findOne({
        $or: [
          { fromUserId: viewerId, toUserId: targetId },
          { fromUserId: targetId, toUserId: viewerId },
        ],
      });

      if (request) {
        if (request.status === "accepted") {
          relationship = "connection";
        } else if (request.status === "interested") {
          relationship =
            request.toUserId.toString() === viewerId.toString()
              ? "received_request"
              : "sent_request";
          if (relationship === "received_request") {
            requestId = request._id.toString();
          }
        } else {
          relationship = "ignored";
        }
      }

      //Did either of us super connect with the other?
      const superLike = await SuperLike.findOne({
        $or: [
          { fromUserId: viewerId, toUserId: targetId },
          { fromUserId: targetId, toUserId: viewerId },
        ],
      });
      superConnect = Boolean(superLike);
    }

    res.json({ data: toSafeUser(target), relationship, requestId, superConnect });
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

userRouter.get("/user/connections", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    const connections = await ConnectionRequest.find({
      $or: [
        { toUserId: loggedInUser._id, status: "accepted" },
        { fromUserId: loggedInUser._id, status: "accepted" },
      ],
    })
      .populate("fromUserId", USER_SAFE_DATA)
      .populate("toUserId", USER_SAFE_DATA);

    // Which matches started with a super connect (either direction)
    const superLikes = await SuperLike.find({
      $or: [
        { fromUserId: loggedInUser._id },
        { toUserId: loggedInUser._id },
      ],
    }).select("fromUserId toUserId");

    const superIds = new Set();
    superLikes.forEach((s) => {
      superIds.add(s.fromUserId.toString());
      superIds.add(s.toUserId.toString());
    });

    const data = connections.map((row) => {
      const other =
        row.fromUserId._id.toString() === loggedInUser._id.toString()
          ? row.toUserId
          : row.fromUserId;
      return {
        ...toSafeUser(other),
        superConnect: superIds.has(String(other._id)),
      };
    });

    res.json({ data });
  } catch (err) {
    res.status(400).json({
      message: "ERROR " + err.message,
    });
  }
});

userRouter.get("/feed", userAuth, async (req, res) => {
  try {
    const loggedInUser = await req.user;

    //if page not passed, assume to be 1
    const page = parseInt(req.query.page) || 1;

    //if limit not passed, assume to be 10
    let limit = parseInt(req.query.limit) || 10;
    //if limit > 30, set limit to 30 or the limit (from qeury or 10)
    limit = limit > 30 ? 30 : limit;

    const skipUsers = (page - 1) * limit;

    //MODE: "similar" (who is like me, default) vs "complementary" (who fills
    //my stack's gaps — the co-founder view). Ranked with a different scorer
    //and cached under a mode-scoped key.
    const mode = req.query.mode === "complementary" ? "complementary" : "similar";

    //CACHED DECK: the ranked deck is expensive to build (a full O(N) scoring
    //pass). It is cached per user for TTL_MS and invalidated on every swipe /
    //super connect / request review / profile edit — i.e. exactly when the
    //ranking inputs change. On a hit we skip straight to the page slice.
    let ranked;
    let superLikeFromIds = [];
    let cacheStatus = "MISS";

    const cached = deckCache.get(loggedInUser._id, mode);
    if (cached) {
      ranked = cached.deck;
      superLikeFromIds = cached.starredIds;
      cacheStatus = "HIT";
    } else {
      //1. Find all connection requests (sent + received)
      const connectionRequests = await ConnectionRequest.find({
        $or: [{ fromUserId: loggedInUser._id }, { toUserId: loggedInUser._id }],
      }).select("fromUserId toUserId");

      const hiddenUsersFromFeed = new Set();
      connectionRequests.forEach((req) => {
        hiddenUsersFromFeed.add(req.fromUserId.toString());
        hiddenUsersFromFeed.add(req.toUserId.toString());
      });

      const hiddenIds = Array.from(hiddenUsersFromFeed).map(
        (id) => new mongoose.Types.ObjectId(id),
      );
      hiddenIds.push(loggedInUser._id);

      const loggedInGender = String(loggedInUser.gender || "").toLowerCase();
      const preferGender =
        loggedInGender === "male"
          ? "female"
          : loggedInGender === "female"
            ? "male"
            : null;

      //Who super connected with me in the last 24h -> boosted to the top of my feed
      const superLikesReceived = await SuperLike.find({
        toUserId: loggedInUser._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).select("fromUserId");
      superLikeFromIds = superLikesReceived.map((s) => s.fromUserId);

      //Light projection: only the fields the scorer/rank needs. Full profiles are
      //fetched afterwards for the current page only ($in). Exactly 2 queries, no N+1.
      const candidates = await User.find(
        { _id: { $nin: hiddenIds } },
        { _id: 1, skills: 1, location: 1, gender: 1 },
      ).lean();

      //Seen-pile: drop every card the user has already DECIDED on (liked/ignored/
      //connected — grown only by swipes, never by merely looking). We already have
      //all candidates in memory, so this filter is free (no extra query).
      const unseen = filterSeen(candidates, loggedInUser.seenIds);

      //Deterministic, per-day seed -> stable pagination (no duplicate cards
      //across pages) while still getting fresh variety each day.
      const seed = `${String(loggedInUser._id)}|${new Date()
        .toISOString()
        .slice(0, 10)}`;

      ranked = rankFeed(loggedInUser, unseen, {
        starredIds: superLikeFromIds,
        preferGender,
        seed,
        mode,
      });

      deckCache.set(loggedInUser._id, ranked, superLikeFromIds, mode);
    }

    const pageCandidates = ranked.slice(skipUsers, skipUsers + limit);

    const fullUsers = await User.find({
      _id: { $in: pageCandidates.map((c) => c._id) },
    }).select(USER_SAFE_DATA);

    const userById = new Map(fullUsers.map((u) => [String(u._id), u]));

    const starredIds = new Set(superLikeFromIds.map((id) => String(id)));
    const usersInFeed = pageCandidates
      .map((candidate) => {
        const user = userById.get(String(candidate._id));
        if (!user) return null;
        const safe = toSafeUser(user);
        safe.starredYou = starredIds.has(String(candidate._id));
        safe.score = candidate.score;
        safe.breakdown = candidate.breakdown;
        safe.reasons = generateMatchReasons(loggedInUser, candidate, {
          starredYou: safe.starredYou,
          mode,
        });
        return safe;
      })
      .filter(Boolean);

    //NOTE: shown cards are NOT marked seen — the seen-pile only grows when the
    //user swipes (request.js). Refreshing keeps undecided cards available.

    res.set("x-cache", cacheStatus);
    res.send(usersInFeed);
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

//Cache observability for the interview demo: hit/miss counts + hit rate.
userRouter.get("/user/cache-stats", userAuth, async (req, res) => {
  res.json({ data: deckCache.stats() });
});

//LeetCode activity heatmap for any user's profile (backed by a 6h cache)
userRouter.get("/user/:userId/leetcode-stats", userAuth, async (req, res) => {
  try {
    const targetId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const target = await User.findById(targetId).select("codingProfiles");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const username = extractLeetcodeUsername(target.codingProfiles?.leetcode);
    if (!username) {
      return res
        .status(404)
        .json({ message: "This user has not linked a LeetCode profile" });
    }

    const result = await fetchLeetCodeStats(username);
    if (!result.ok) {
      return res.status(result.code).json({ message: result.message });
    }

    res.json({ data: result.data });
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

module.exports = userRouter;
