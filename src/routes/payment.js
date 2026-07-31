const express = require("express");
const { userAuth } = require("../middlewares/auth");
const paymentRouter = express.Router();
const stripeInstance = require("../utils/stripe");
const Payment = require("../models/payment");
const User = require("../models/user");
const { membershipAmount } = require("../utils/constants");

// 1. Create Stripe Checkout Session
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
      req.get("origin") ||
      process.env.CLIENT_URL ||
      "https://devtinder-new.indevs.in";

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

    // Save Payment record to DB (pending status)
    const payment = new Payment({
      userId,
      paymentId: session.id,
      productId: product.id,
      priceId: price.id,
      membershipType,
      amount: amount * 100,
      currency,
      status: "pending",
    });

    const savedPayment = await payment.save();

    return res.json({
      checkoutUrl: session.url,
      url: session.url,
      sessionId: session.id,
      payment: savedPayment,
    });
  } catch (error) {
    console.error("Stripe payment creation error:", error);
    return res.status(500).json({
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

// 2. Stripe Webhook Endpoint (No userAuth needed as Stripe calls this directly)
paymentRouter.post("/payment/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret,
      );
    } else {
      // Fallback if secret not configured yet in dev
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("Payment successful for session:", session.id);

        const payment = await Payment.findOne({ paymentId: session.id });

        if (!payment) {
          console.log("Payment record not found for session:", session.id);
          return res.status(200).json({ received: true });
        }

        // Prevent duplicate processing
        if (payment.status === "completed" || payment.status === "paid") {
          console.log("Payment already processed:", session.id);
          return res.status(200).json({ received: true });
        }

        // Update payment status
        payment.status = "completed";
        await payment.save();

        // Upgrade user
        const user = await User.findById(payment.userId);
        if (user) {
          user.isPremium = true;
          user.membershipType = payment.membershipType;
          await user.save();
          console.log(`${user.firstName} upgraded to Premium`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    return res.status(500).send(`Webhook Error: ${err.message}`);
  }
});

// 3. Verify Payment after Checkout redirect (Instant sync backup for frontend)
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
        payment.status = "completed";
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

    return res
      .status(400)
      .json({ success: false, message: "Payment not completed" });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Check Premium status
paymentRouter.get("/payment/premium/verify", userAuth, async (req, res) => {
  try {
    const user = req.user.toJSON ? req.user.toJSON() : req.user;
    return res.json({
      isPremium: Boolean(user.isPremium),
      user,
      membershipType: user.membershipType || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Cancel Premium membership
paymentRouter.post("/payment/premium/cancel", userAuth, async (req, res) => {
  try {
    const user = req.user;
    user.isPremium = false;
    user.membershipType = undefined;
    await user.save();
    return res.json({ message: "Membership cancelled successfully", user });
  } catch (err) {
    console.error(err);
    return res.status(500).send("ERROR: " + err.message);
  }
});

module.exports = paymentRouter;
