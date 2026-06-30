const jwt = require("jsonwebtoken");
const User = require("../models/user");

//Helper function to parse raw Cookie header string into an object
//cookie-parser is Express middleware, and Socket.IO connections do not go through the Express middleware chain.
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  //split into individual cookies     //reduce into an object (key,val pair)
  return cookieHeader.split(";").reduce((acc, cookieStr) => {
    const [key, value] = cookieStr.split("=");
    if (key && value) {
      //trim the leading spaces       //decode the URI component (like%)
      acc[key.trim()] = decodeURIComponent(value.trim());
    }
    return acc;
  }, {});
};
//Socket.io middleware to authenticate connections using cookie-based JWT
const socketAuth = async (socket, next) => {
  try {
    //Extract cookie header from socket handshake request
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const { token } = cookies;

    if (!token) {
      return next(new Error("Authentication error: User not logged in."));
    }

    //Validate the JWT token
    const decodedData = await jwt.verify(token, process.env.JWT_SECRET);

    //Find the user by ID
    const { _id } = decodedData;
    const user = await User.findById(_id);

    if (!user) {
      return next(new Error("Authentication error: User not found!"));
    }
    // Attach the authenticated user object to the socket
    socket.user = user;
    next();
  } catch (err) {
    return next(new Error("Authentication error: " + err.message));
  }
};

const userAuth = async (req, res, next) => {
  try {
    //Read the token from request cookies
    const cookies = req.cookies;
    const { token } = cookies;

    if (!token) {
      return res.status(401).send("User not logged in!");
    }

    //Validate the token
    const decodedData = await jwt.verify(token, "DEV@Tinder#790$");

    //Find the user
    const { _id } = decodedData;
    const user = await User.findById(_id);

    if (!user) {
      throw new Error("User not found!");
    }

    //If user found, attach my user to the request
    req.user = user;

    //Call the next request handler
    next();
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
};

module.exports = {
  userAuth,
  socketAuth,
};
