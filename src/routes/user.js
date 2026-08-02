const express = require("express");
const mongoose = require("mongoose");
const userRouter = express.Router();

const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");

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

    //Finding name of these connection requests

    //Way 1: Looping over each request and then find name -> Poor way of handling

    //Way 2: Building relation bw two tables -> ConnectionRequest & User

    res.json({ message: "Data Sent Successfully", data: connectionRequests });
  } catch (err) {
    req.statusCode(400).send("ERROR: " + err.message);
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

    // console.log(connections);

    const data = connections.map((row) => {
      if (row.fromUserId._id.toString() === loggedInUser._id.toString()) {
        return row.toUserId;
      }
      return row.fromUserId;
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
    const preferField =
      loggedInGender === "male"
        ? "Female"
        : loggedInGender === "female"
          ? "Male"
          : null;

    const usersInFeed = await User.aggregate([
      { $match: { _id: { $nin: hiddenIds } } },
      {
        $addFields: {
          _genderPreference: preferField
            ? {
                $cond: {
                  if: {
                    $eq: [{ $toLower: "$gender" }, preferField.toLowerCase()],
                  },
                  then: 0,
                  else: 1,
                },
              }
            : 1,
          _rand: { $rand: {} },
        },
      },
      { $sort: { _genderPreference: 1, _rand: 1 } },
      { $skip: skipUsers },
      { $limit: limit },
      {
        $project: Object.fromEntries(
          USER_SAFE_DATA.split(" ").map((field) => [field, 1]),
        ),
      },
    ]);

    res.send(usersInFeed);
  } catch (err) {
    res.status(400).json({ message: "ERROR: " + err.message });
  }
});

module.exports = userRouter;
