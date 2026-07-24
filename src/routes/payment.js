const express = require("express");
const { userAuth } = require("../middlewares/auth");
const paymentRouter = express.Router();
const stripeInstance = require("../utils/stripe");
const Payment = require("../models/payment");
const User = require("../models/user");
const { membershipAmount } = require("../utils/constants");

// 1. Check user premium status (Required by 02siri/dev-finder-web Premium.jsx)
paymentRouter.get("/payment/premium/verify", userAuth, async (req, res) => {
  try {
    const user = req.user;
    return res.json({
      isPremium: user.isPremium || false,
      membershipType: user.membershipType || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Create Stripe Checkout Session (Matches 02siri/dev-finder-web handleBuyClick)
paymentRouter.post("/payment/createProduct", userAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, emailId } = req.user;
    const { membershipType } = req.body;

    if (!membershipType || !membershipAmount[membershipType.toLowerCase()]) {
      return res.status(400).json({ message: "Invalid membership type" });
    }

    const currency = "inr";
    const amount = membershipAmount[membershipType.toLowerCase()];

    // Create Stripe Product
    const product = await stripeInstance.products.create({
      name: `${membershipType.toUpperCase()} Membership`,
      metadata: { firstName, lastName, emailId, membershipType },
    });

    // Create Stripe Price
    const price = await stripeInstance.prices.create({
      unit_amount: amount * 100, // Amount in lowest currency unit (paise)
      currency,
      product: product.id,
    });

    const clientUrl =
      req.get("origin") || process.env.CLIENT_URL || "http://localhost:5173";

    // Create Stripe Checkout Session
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: emailId,
      success_url: `${clientUrl}/premium?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/premium?payment=cancel`,
    });

    // Save Payment record to DB
    const payment = new Payment({
      userId,
      paymentId: session.id,
      productId: product.id,
      priceId: price.id,
      membershipType,
      amount: amount * 100,
      currency,
      status: session.payment_status || "created",
    });

    const savedPayment = await payment.save();

    // Response matching res.data.checkoutUrl in 02siri/dev-finder-web
    res.json({
      checkoutUrl: session.url,
      url: session.url,
      sessionId: session.id,
      payment: savedPayment,
    });
  } catch (error) {
    console.error("Stripe payment creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
});

// Alias for /payment/create route compatibility
paymentRouter.post("/payment/create", userAuth, async (req, res, next) => {
  req.url = "/payment/createProduct";
  paymentRouter.handle(req, res, next);
});

// 3. Verify Payment after Checkout redirect
paymentRouter.post("/payment/verify", userAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "Session ID required" });
    }

    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      const payment = await Payment.findOne({ paymentId: sessionId });
      if (payment) {
        payment.status = "paid";
        await payment.save();

        await User.findByIdAndUpdate(req.user._id, {
          isPremium: true,
          membershipType: payment.membershipType,
        });

        return res.json({
          success: true,
          message: "Payment verified successfully",
        });
      }
    }

    res.status(400).json({ success: false, message: "Payment not completed" });
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = paymentRouter;
