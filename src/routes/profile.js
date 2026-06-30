const express = require("express");
const { userAuth } = require("../middlewares/auth");
const { validateProfileEditData } = require("../utils/validation");
const bcrypt = require("bcrypt");

const profileRouter = express.Router();

profileRouter.get("/profile/view", userAuth, async (req, res) => {
  try {
    res.send(req.user);
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
  try {
    //validate profile Edit Data
    if (!validateProfileEditData(req)) {
      throw new Error("Invalid Edit Request");
      //return req.status(400).send("Invalid Edit Request");
    }

    const loggedInUser = req.user;

    //For each key/field in the request body, make it equal to the loggedIn user
    Object.keys(req.body).forEach((key) => (loggedInUser[key] = req.body[key]));

    await loggedInUser.save();

    // res.send(`${loggedInUser.firstName} your profile Updated Successfully`);

    res.json({
      message: `${loggedInUser.firstName} your profile Updated Successfully`,
      data: loggedInUser,
    });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

profileRouter.patch("/profile/changePassword", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      throw new Error("Please enter old and new passwords");
    }

    const isPswdMatch = await bcrypt.compare(
      oldPassword,
      loggedInUser.password,
    );

    if (!isPswdMatch) {
      throw new Error("Incorrect old password");
    }

    if (!validator.isStrongPassword(newPassword)) {
      throw new Error("Password is not strong enough");
    }

    const hashedNewPswd = await bcrypt.hash(newPassword, 10);

    loggedInUser.password = hashedNewPswd;

    await loggedInUser.save();

    res.send(`${loggedInUser.firstName}, Your password updated successfully`);
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

module.exports = profileRouter;
