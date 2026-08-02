const { SendEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient } = require("./sesClient");

const createSendEmailCommand = (toAddress, fromAddress, subject, html) => {
  return new SendEmailCommand({
    Destination: {
      CcAddresses: [],
      ToAddresses: [toAddress],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: html,
        },
        Text: {
          Charset: "UTF-8",
          Data: "Open this email in a browser that supports HTML to view the code.",
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: fromAddress,
    ReplyToAddresses: [],
  });
};

const emailShell = (innerHtml) => `
  <div style="background:#0b0d16;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#12141f;border:1px solid #24283a;border-radius:16px;overflow:hidden;">
      <div style="padding:22px 28px;background:linear-gradient(90deg,#ff2d55,#8b5cf6);">
        <span style="color:#fff;font-weight:800;font-size:18px;letter-spacing:1px;">DevTinder</span>
      </div>
      <div style="padding:28px;">
        ${innerHtml}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #24283a;color:#7c8198;font-size:11px;">
        If you didn't request this, you can safely ignore this email.
      </div>
    </div>
  </div>
`;

const sendOtpEmail = async (toEmailId, purpose, code) => {
  const isVerify = purpose === "verify";
  const subject = isVerify
    ? "Verify your DevTinder account"
    : "Reset your DevTinder password";

  const html = emailShell(`
    <h2 style="color:#ffffff;margin:0 0 8px;font-size:20px;">
      ${isVerify ? "Welcome to DevTinder!" : "Password reset requested"}
    </h2>
    <p style="color:#a7acbf;font-size:13px;line-height:1.6;margin:0 0 20px;">
      ${isVerify
        ? "Use the code below to verify your email address and activate your account. It expires in 10 minutes."
        : "Use the code below to choose a new password. It expires in 10 minutes."}
    </p>
    <div style="text-align:center;margin:0 0 20px;">
      <span style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:10px;color:#ff2d55;background:rgba(255,45,85,0.1);border:1px dashed rgba(255,45,85,0.5);border-radius:12px;padding:14px 22px;">
        ${code}
      </span>
    </div>
    <p style="color:#7c8198;font-size:12px;line-height:1.6;margin:0;">
      Didn't request this? Your account stays safe — just ignore this email.
    </p>
  `);

  // SES in Sandbox only delivers to verified addresses. Set EMAIL_FORWARD_TO
  // (e.g. your own verified inbox) while testing so every OTP reaches you.
  const recipient = process.env.EMAIL_FORWARD_TO || toEmailId;
  const source = process.env.SES_FROM_EMAIL || "royu99099@gmail.com";

  const command = createSendEmailCommand(recipient, source, subject, html);

  try {
    return await sesClient.send(command);
  } catch (caught) {
    if (caught instanceof Error && caught.name === "MessageRejected") {
      return caught;
    }
    throw caught;
  }
};

module.exports = { sendOtpEmail };
