require("dotenv").config();
require("./utils/cronJobs");

const express = require("express");
const http = require("http");
const path = require("path");
const connectDB = require("./config/database");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const initializeSocket = require("./utils/socket");

const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/request");
const userRouter = require("./routes/user");
const paymentRouter = require("./routes/payment");
const chatRouter = require("./routes/chat");
const uploadRouter = require("./routes/upload");
const notificationRouter = require("./routes/notification");

const app = express();

const server = http.createServer(app);

app.use("/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);
app.use("/", paymentRouter);
app.use("/", chatRouter);
app.use("/", uploadRouter);
app.use("/", notificationRouter);

initializeSocket(server);

connectDB()
  .then(() => {
    console.log("Database connected successfully");

    const PORT = process.env.PORT || 7777;
    server.listen(PORT, () => {
      console.log("Server and Socket.IO running on port " + PORT);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
  });
