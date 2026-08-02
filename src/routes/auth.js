const express = require("express");
const authRouter = express.Router();

const { validateSignUpData } = require("../utils/validation");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const validator = require("validator");

const toSafeUser = (user) => {
  const safe = user.toObject ? user.toObject() : { ...user };
  delete safe.password;
  return safe;
};

const setAuthCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 3600000),
    sameSite: "lax",
  });
};

authRouter.post("/signup", async (req, res) => {
  try {
    //1. Validation of data
    validateSignUpData(req);

    const { firstName, lastName, emailId, password } = req.body;

    //2. Encrypt the password
    const passwordHash = await bcrypt.hash(password, 10);

    //3. Create new user
    const user = new User({
      firstName,
      lastName,
      emailId,
      password: passwordHash,
    });
    const savedUser = await user.save();

    //4. Log them in right away
    const token = await savedUser.getJWT();
    setAuthCookie(res, token);

    res.status(201).json({
      message: "User created successfully",
      data: toSafeUser(savedUser),
    });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;

    if (!validator.isEmail(emailId)) {
      throw new Error("Email Id not valid");
    }

    //1. find user in the DB
    const user = await User.findOne({ emailId: String(emailId).trim().toLowerCase() });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    //2. compare the password
    const isPswdValid = await user.validatePswd(password);
    if (!isPswdValid) {
      throw new Error("Invalid credentials");
    }

    const token = await user.getJWT();
    setAuthCookie(res, token);

    res.send(toSafeUser(user));
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/logout", async (req, res) => {
  //Expiring the cookie right there when the user calls this API
  res.cookie("token", null, {
    expires: new Date(Date.now()), //expiry time -> current time
  });
  res.send("Logout Successful");
});

module.exports = authRouter;
