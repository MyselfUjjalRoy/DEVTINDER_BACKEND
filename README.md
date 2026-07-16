🚀 DevTinder Backend
<p align="center">
  <strong>A scalable backend powering a modern social networking platform for developers.</strong>
</p>
<p align="center">
🌐 <b>Live Application</b><br>
<a href="https://devtinder-new.indevs.in/">https://devtinder-new.indevs.in/</a>
</p>
---
📖 About the Project
DevTinder is a production-ready backend for a developer networking platform where developers can discover each other, send connection requests, chat in real time, and upgrade to premium memberships.
Built with Node.js, Express.js, MongoDB, and Socket.io, the application demonstrates modern backend engineering practices including JWT authentication, REST APIs, real-time communication, Stripe payment processing, Amazon SES email notifications, and scheduled background jobs.
✨ Features
🔐 JWT Authentication & Secure Cookies
👤 Profile Management
🤝 Connection Requests
💬 Real-Time Chat (Socket.io)
💳 Stripe Premium Memberships
📧 Amazon SES Email Notifications
⏰ Node-Cron Scheduled Jobs
---
🛠 Tech Stack
Category	Technologies
Runtime	Node.js
Framework	Express.js
Database	MongoDB, Mongoose
Authentication	JWT, bcrypt, Cookie Parser
Realtime	Socket.io
Payments	Stripe
Email	Amazon SES
Scheduling	Node-Cron
---
🏗 Architecture
Authentication Layer – JWT-based authentication with protected routes.
Database Layer – MongoDB with optimized Mongoose models.
REST API Layer – Modular Express routes and middleware.
Real-Time Layer – Socket.io powered messaging.
Payment Layer – Stripe Checkout & Webhooks.
Background Jobs – Node-Cron with SES email digests.
---
📡 API Endpoints
Authentication
Method	Endpoint
POST	`/auth/signup`
POST	`/auth/login`
POST	`/auth/logout`
Profile
Method	Endpoint
GET	`/profile/view`
PATCH	`/profile/edit`
PATCH	`/profile/changePassword`
Connections
Method	Endpoint
POST	`/request/send/:status/:toUserId`
POST	`/request/review/:status/:requestId`
GET	`/user/requests/received`
GET	`/user/connections`
Feed
Method	Endpoint
GET	`/feed`
Chat
Method	Endpoint
GET	`/chat/:targetUserId`
Payments
Method	Endpoint
POST	`/payment/createProduct`
POST	`/payment/webhook`
GET	`/payment/premium/verify`
POST	`/payment/premium/cancel`
---
🚀 Getting Started
```bash
npm install
```
Create a `.env` file:
```env
PORT=7777
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=your_region
SES_FROM_EMAIL=your_email
```
Run locally:
```bash
npm run dev
```
---
☁ Deployment
Managed using AWS EC2, PM2, and Nginx.
```bash
pm2 start npm --name "devtinder-backend" -- start
pm2 list
pm2 logs
pm2 restart devtinder-backend
```
---
📁 Project Structure
```text
src/
├── config/
├── middleware/
├── models/
├── routes/
├── utils/
├── cron/
├── socket/
├── app.js
└── server.js
```
---
🚀 Future Improvements
AI Developer Recommendations
Push Notifications
Video Calling
Admin Dashboard
Search & Filters
Progressive Web App
---
⭐ Why DevTinder?
DevTinder demonstrates secure authentication, scalable REST APIs, real-time messaging, cloud integrations, payment processing, and production deployment practices in a single full-stack backend project.
