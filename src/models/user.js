const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      minLength: 4,
      maxLength: 50,
      index: true, //creating an index
    },
    lastName: {
      type: String,
    },
    //If one field is being made as unique, MongoDB automatically makes that as the index of the DB
    emailId: {
      type: String,
      required: true,
      unique: true,
      trime: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email address: " + value);
        }
      },
    },
    password: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      min: 21,
    },
    gender: {
      type: String,
      enum: {
        values: ["Male", "Female", "Others"],
        message: `{VALUE} is not a valid gender type`,
      },
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    membershipType: {
      type: String,
    },
    photoURL: {
      type: String,
      default: "https://img.freepik.com/free-icon/user_318-563642.jpg",
    },
    about: {
      type: String,
      default: "This is the about section of your profile",
    },
    skills: {
      type: [String],
    },
  },
  {
    timestamps: true,
  },
);

//Not Arrow function; it will break
//because 'this' keyword will not work in arrow function
userSchema.methods.getJWT = async function () {
  const user = this;
  const token = await jwt.sign({ _id: user._id }, "DEV@Tinder#790$", {
    expiresIn: "1d",
  });

  return token;
};

userSchema.methods.validatePswd = async function (passwordInputByUser) {
  const user = this;
  const passwordHash = user.password;

  const isPswdValid = bcrypt.compare(passwordInputByUser, passwordHash);
  return isPswdValid;
};

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;
