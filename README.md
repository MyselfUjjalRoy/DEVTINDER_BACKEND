<div align="center">

# 🚀 DevTinder Backend

### *Powering a Modern Developer Networking Platform*

<p>
A scalable and production-ready backend built with the <b>MERN</b> ecosystem, enabling developers to connect, communicate, and collaborate in real time.
</p>

<p>
<a href="https://devtinder-new.indevs.in/" target="_blank">
<img src="https://img.shields.io/badge/🌐_Live_Demo-devtinder--new.indevs.in-2563EB?style=for-the-badge" />
</a>
</p>

<p>

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

</p>

<p>

![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white)
![AWS SES](https://img.shields.io/badge/AWS_SES-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=jsonwebtokens)
![License](https://img.shields.io/badge/License-MIT-success?style=for-the-badge)

</p>

</div>

---

# 📖 About the Project

**DevTinder** is a production-ready backend powering a modern social networking platform designed specifically for developers. It enables users to discover other developers, send connection requests, build professional networks, exchange real-time messages, and unlock premium features through secure subscription payments.

The backend follows a modular architecture built with **Node.js**, **Express.js**, and **MongoDB**, exposing RESTful APIs secured with **JWT authentication** and **HTTP-only cookies**. It integrates **Socket.io** for real-time communication, **Stripe** for premium subscriptions, **Amazon SES** for email notifications, and **Node-Cron** for automated background tasks.

Designed with scalability, maintainability, and security in mind, DevTinder demonstrates industry-standard backend development practices and serves as an excellent showcase of modern full-stack engineering.

---

# ✨ Core Features

## 🔐 Authentication & Security

- Secure User Registration
- Login & Logout
- JWT Authentication
- HTTP-only Cookie Sessions
- Password Hashing with bcrypt
- Protected Routes
- Authentication Middleware

---

## 👤 User Profile

- View Profile
- Edit Profile
- Update Personal Information
- Change Password
- Premium Membership Status

---

## 🤝 Connection Management

- Send Connection Requests
- Accept Requests
- Reject Requests
- Ignore Requests
- Pending Requests
- Accepted Connections

---

## 💬 Real-Time Chat

- Socket.io Messaging
- Private Chat Rooms
- Live Message Delivery
- Persistent Chat History
- Cookie Authenticated Socket Connections

---

## 💳 Premium Membership

- Stripe Checkout Sessions
- Subscription Verification
- Stripe Webhooks
- Premium Cancellation

---

## 📧 Notification System

- Amazon SES Integration
- Daily Notification Emails
- Scheduled Background Jobs
- Automated Digests

---

# 🛠 Tech Stack

| Category | Technologies |
|----------|--------------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Authentication | JWT, bcrypt, Cookie Parser |
| Real-Time Communication | Socket.io |
| Payment Gateway | Stripe |
| Email Service | Amazon SES |
| Scheduling | Node-Cron |
| Utilities | dotenv, validator, cors |

---

# 🏗️ System Architecture

## Database Layer

- MongoDB Database
- Mongoose ODM
- Optimized Indexing
- Relational Data Modeling

---

## Authentication Layer

- JWT Authentication
- Cookie Sessions
- Authorization Middleware
- Password Encryption

---

## REST API Layer

- Express.js
- Modular Routes
- Controllers
- Middleware
- Error Handling

---

## Real-Time Communication

- Socket.io Server
- Authenticated WebSocket Connections
- Dynamic Chat Rooms
- Persistent Messages

---

## Payment Layer

- Stripe Checkout
- Subscription Management
- Webhook Verification

---

## Background Services

- Node-Cron Jobs
- Email Notifications
- Scheduled Tasks

---

# 📡 REST API

## 🔐 Authentication

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/signup` | Register a New User |
| POST | `/auth/login` | Authenticate User |
| POST | `/auth/logout` | Logout User |

---

## 👤 Profile

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/profile/view` | Get Profile |
| PATCH | `/profile/edit` | Edit Profile |
| PATCH | `/profile/changePassword` | Change Password |

---

## 🤝 Connection Requests

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/request/send/:status/:toUserId` | Send Connection Request |
| POST | `/request/review/:status/:requestId` | Accept / Reject Request |
| GET | `/user/requests/received` | Pending Requests |
| GET | `/user/connections` | Accepted Connections |

---

## 🌍 Feed

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/feed` | Developer Feed |

---

## 💬 Chat

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/chat/:targetUserId` | Retrieve Chat History |

---

## 💳 Payments

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/payment/createProduct` | Create Stripe Checkout |
| POST | `/payment/webhook` | Handle Stripe Webhook |
| GET | `/payment/premium/verify` | Verify Premium Status |
| POST | `/payment/premium/cancel` | Cancel Premium Membership |

---
# 🚀 Getting Started

Follow these steps to set up the backend locally.

---

## 📋 Prerequisites

Make sure you have the following installed:

- Node.js (v18 or later)
- npm
- MongoDB
- Git

---

## 📥 Clone the Repository

```bash
git clone https://github.com/MyselfUjjalRoy/DEVTINDER_BACKEND.git
cd DEVTINDER_BACKEND
```

---

## 📦 Install Dependencies

```bash
npm install
```

---

# ⚙️ Environment Variables

Create a **.env** file in the root directory.

```env
PORT=7777

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

STRIPE_SECRET_KEY=your_stripe_secret_key

STRIPE_WEBHOOK_SECRET=your_webhook_secret

AWS_ACCESS_KEY_ID=your_access_key

AWS_SECRET_ACCESS_KEY=your_secret_key

AWS_REGION=your_region

SES_FROM_EMAIL=your_verified_email
```

---

# ▶️ Running the Application

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The backend will start on:

```
http://localhost:7777
```

---

# ☁️ Deployment

The backend is deployed on an **AWS EC2 (Ubuntu)** instance using **PM2** and **Nginx**.

## Connect to EC2

```bash
ssh -i "your-key.pem" ubuntu@your-ec2-ip
```

---

## Start Server with PM2

```bash
pm2 start npm --name "devtinder-backend" -- start
```

---

## Monitor Running Processes

```bash
pm2 list
```

---

## View Logs

```bash
pm2 logs
```

---

## Restart Application

```bash
pm2 restart devtinder-backend
```

---

# 🌐 Reverse Proxy (Nginx)

Nginx forwards incoming HTTPS requests to the backend server running on **localhost:7777**.

```
                Client
                   │
                   ▼
         ┌──────────────────┐
         │      Nginx       │
         │   HTTPS Server   │
         └────────┬─────────┘
                  │
                  ▼
      ┌────────────────────────┐
      │ Express.js (Port 7777) │
      └────────┬───────────────┘
               │
               ▼
      ┌────────────────────────┐
      │       MongoDB          │
      └────────────────────────┘
```

---

# 📂 Project Structure

```
devtinder-backend/
│
├── src/
│   ├── config/
│   ├── cron/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   ├── utils/
│   ├── app.js
│   └── server.js
│
├── .env
├── package.json
├── package-lock.json
└── README.md
```

---

# 🔒 Security Highlights

- JWT Authentication
- HTTP-only Cookies
- Password Hashing using bcrypt
- Protected API Routes
- Stripe Webhook Verification
- Secure Socket Authentication
- Environment Variable Configuration

---

# ⚡ Performance Features

- Optimized MongoDB Queries
- Indexed Database Collections
- Lightweight REST APIs
- Efficient Middleware Pipeline
- Persistent Socket Connections
- Background Job Scheduling

---

# 🎯 Future Enhancements

- 🤖 AI-based Developer Recommendations
- 🔍 Advanced Search & Filtering
- 📱 Progressive Web App (PWA)
- 🔔 Push Notifications
- 🎥 Video & Voice Calling
- 🛡️ User Verification
- 🌍 Multi-language Support
- 📊 Admin Analytics Dashboard
- 📈 User Activity Insights
- 🏷️ Skill-based Matchmaking

---

# 🌟 Why DevTinder?

DevTinder is more than just a backend project—it is a comprehensive demonstration of building scalable, secure, and production-ready backend systems.

It showcases:

- RESTful API Design
- JWT Authentication
- Real-Time Communication
- Payment Gateway Integration
- Email Automation
- Background Scheduling
- Cloud Deployment
- Modular Architecture
- Scalable Database Design

The project reflects industry-standard backend development practices and demonstrates the technologies commonly used in modern production applications.

---

# 🤝 Contributing

Contributions are always welcome!

1. Fork the repository.
2. Create your feature branch.

```bash
git checkout -b feature/amazing-feature
```

3. Commit your changes.

```bash
git commit -m "Add amazing feature"
```

4. Push to the branch.

```bash
git push origin feature/amazing-feature
```

5. Open a Pull Request.

---

# ⭐ Show Your Support

If you found this project useful, please consider giving it a ⭐ on GitHub.

Your support motivates continued development and helps others discover the project.

---

<div align="center">

## 🚀 Built with ❤️ using Node.js, Express.js, MongoDB & Socket.io

### 🌐 Live Application

### https://devtinder-new.indevs.in/

**Thank you for visiting the DevTinder project! Happy Coding! 💙**

</div>
