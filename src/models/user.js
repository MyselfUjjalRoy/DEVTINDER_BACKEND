const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      minLength: 1,
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
    },
    // Set only when the user signs in with Google (OAuth). Makes the
    // user identifiable as a Google account and lets us link logins.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Set only when the user signs in with GitHub (OAuth). Same purpose
    // as googleId — lets us link and re-identify GitHub logins.
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    age: {
      type: Number,
      min: 15,
      max: 100,
    },
    // Date of birth (YYYY-MM-DD). Age is derived from this automatically.
    dob: {
      type: String,
      trim: true,
      validate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
          throw new Error("dob must be in YYYY-MM-DD format");
        }
      },
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
    //Daily super connect quota tracking (resets at midnight IST)
    superLikesUsed: {
      type: Number,
      default: 0,
    },
    superLikesDate: {
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
    location: {
      city: {
        type: String,
        trim: true,
        maxLength: 100,
      },
      country: {
        type: String,
        trim: true,
        maxLength: 100,
      },
    },
    hobbies: {
      type: [String],
    },
    likes: {
      type: [String],
    },
    dislikes: {
      type: [String],
    },
    photos: {
      type: [String],
      validate: {
        validator: (value) => value.length <= 3,
        message: "You can add at most 3 photos",
      },
    },
    isStudent: {
      type: Boolean,
      default: true,
    },
    education: {
      college: {
        type: String,
        trim: true,
        maxLength: 150,
      },
      degree: {
        type: String,
        trim: true,
        maxLength: 150,
      },
      passingYear: {
        type: Number,
      },
      cgpa: {
        type: Number,
        min: 0,
        max: 10,
      },
    },
    work: {
      company: {
        type: String,
        trim: true,
        maxLength: 150,
      },
      role: {
        type: String,
        trim: true,
        maxLength: 150,
      },
      experienceYears: {
        type: Number,
        min: 0,
        max: 60,
      },
    },
    codingProfiles: {
      leetcode: {
        type: String,
        trim: true,
        maxLength: 500,
      },
      gfg: {
        type: String,
        trim: true,
        maxLength: 500,
      },
      codeforces: {
        type: String,
        trim: true,
        maxLength: 500,
      },
      codechef: {
        type: String,
        trim: true,
        maxLength: 500,
      },
      hackerrank: {
        type: String,
        trim: true,
        maxLength: 500,
      },
      codingninjas: {
        type: String,
        trim: true,
        maxLength: 500,
      },
    },
    github: {
      type: String,
      trim: true,
      maxLength: 500,
    },
    linkedin: {
      type: String,
      trim: true,
      maxLength: 500,
    },
    portfolio: {
      type: String,
      trim: true,
      maxLength: 500,
    },
    resumeURL: {
      type: String,
      trim: true,
      maxLength: 500,
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
  const token = await jwt.sign(
    { _id: user._id },
    process.env.JWT_SECRET || "DEV@Tinder#790$",
    {
      expiresIn: "1d",
    },
  );

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
