const express = require("express");
const authRouter = express.Router();

const { validateSignUpData } = require("../utils/validation");
const { createOtp, verifyOtp } = require("../utils/otpService");
const { sendOtpEmail } = require("../utils/sendEmail");
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

    //3. Create new user (not verified until they prove the email)
    const user = new User({
      firstName,
      lastName,
      emailId,
      password: passwordHash,
      isEmailVerified: false,
    });
    const savedUser = await user.save();

    //4. Generate + email a 6-digit verification code
    const code = await createOtp(emailId, "verify");
    let emailSent = false;
    try {
      await sendOtpEmail(emailId, "verify", code);
      emailSent = true;
    } catch (sendErr) {
      console.error("Verification email failed:", sendErr.message);
    }

    res.status(201).json({
      message: "Account created! Check your email for the verification code.",
      data: toSafeUser(savedUser),
      emailSent,
    });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/verify-email", async (req, res) => {
  try {
    const { emailId, otp } = req.body;

    if (!validator.isEmail(emailId) || !otp) {
      throw new Error("Email and code are required");
    }

    const result = await verifyOtp(emailId, "verify", otp);
    if (!result.ok) throw new Error(result.reason);

    const user = await User.findOne({ emailId: String(emailId).trim().toLowerCase() });
    if (!user) throw new Error("No account found for this email");

    if (user.isEmailVerified === false) {
      user.isEmailVerified = true;
      await user.save();
    }

    const token = await user.getJWT();
    setAuthCookie(res, token);

    res.json({ message: "Email verified successfully", data: toSafeUser(user) });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/resend-verification", async (req, res) => {
  try {
    const { emailId } = req.body;

    if (!validator.isEmail(emailId)) {
      throw new Error("A valid email is required");
    }

    const code = await createOtp(emailId, "verify");
    await sendOtpEmail(emailId, "verify", code);

    res.json({ message: "Verification code resent to your email" });
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

    //3. only verified accounts can sign in
    if (user.isEmailVerified === false) {
      return res.status(403).send("Please verify your email before logging in");
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
