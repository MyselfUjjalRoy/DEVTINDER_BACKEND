const crypto = require("crypto");
const Otp = require("../models/otp");

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const generateOtp = () =>
  String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const hashOtp = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

// Creates a new OTP for an email + purpose and returns the PLAINTEXT code.
// Only the hash is persisted. Any previous codes for the same email+purpose
// are invalidated so an old code cannot be replayed after a resend.
const createOtp = async (emailId, purpose) => {
  const normalized = String(emailId).trim().toLowerCase();
  const code = generateOtp();

  await Otp.updateMany(
    { emailId: normalized, purpose, used: false },
    { $set: { used: true } },
  );

  await Otp.create({
    emailId: normalized,
    purpose,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  return code;
};

// Verifies a plaintext code against the latest unused OTP for email+purpose.
// Consumes the code on success and limits failed attempts.
const verifyOtp = async (emailId, purpose, code) => {
  const normalized = String(emailId).trim().toLowerCase();
  const otp = await Otp.findOne({
    emailId: normalized,
    purpose,
    used: false,
  }).sort({ createdAt: -1 });

  if (!otp) return { ok: false, reason: "No active code. Please request a new one." };

  if (otp.expiresAt < new Date()) {
    await Otp.updateOne({ _id: otp._id }, { $set: { used: true } });
    return { ok: false, reason: "This code has expired. Please request a new one." };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.updateOne({ _id: otp._id }, { $set: { used: true } });
    return { ok: false, reason: "Too many wrong attempts. Please request a new code." };
  }

  if (hashOtp(code) !== otp.codeHash) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    return { ok: false, reason: "Incorrect code. Please try again." };
  }

  await Otp.updateOne({ _id: otp._id }, { $set: { used: true } });
  return { ok: true };
};

module.exports = {
  OTP_TTL_MINUTES,
  generateOtp,
  createOtp,
  verifyOtp,
};
