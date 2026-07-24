const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Helper function to parse raw Cookie header string into an object
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookieStr) => {
    const [key, value] = cookieStr.split("=");
    if (key && value) {
      acc[key.trim()] = decodeURIComponent(value.trim());
    }
    return acc;
  }, {});
};

// Socket.io middleware to authenticate connections using cookie-based JWT
const socketAuth = async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const { token } = cookies;

    if (!token) {
      return next(new Error("Authentication error: User not logged in."));
    }

    // Validate the JWT token using the unified JWT secret
    const secret = process.env.JWT_SECRET || "DEV@Tinder#790$";
    let decodedData;
    try {
      decodedData = jwt.verify(token, secret);
    } catch (e) {
      // Fallback check if secret was fallback string
      decodedData = jwt.verify(token, "DEV@Tinder#790$");
    }

    const { _id } = decodedData;
    const user = await User.findById(_id);

    if (!user) {
      return next(new Error("Authentication error: User not found!"));
    }

    socket.user = user;
    next();
  } catch (err) {
    return next(new Error("Authentication error: " + err.message));
  }
};

const userAuth = async (req, res, next) => {
  try {
    const cookies = req.cookies;
    const { token } = cookies;

    if (!token) {
      return res.status(401).send("User not logged in!");
    }

    const secret = process.env.JWT_SECRET || "DEV@Tinder#790$";
    let decodedData;
    try {
      decodedData = jwt.verify(token, secret);
    } catch (e) {
      decodedData = jwt.verify(token, "DEV@Tinder#790$");
    }

    const { _id } = decodedData;
    const user = await User.findById(_id);

    if (!user) {
      throw new Error("User not found!");
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
};

module.exports = {
  userAuth,
  socketAuth,
};
