const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(
    "mongodb+srv://royu99099_db_user:3KyUVQlqJ6BqAzVK@cluster0.xo3ovy5.mongodb.net/devTinder",
  );
};

module.exports = connectDB;
