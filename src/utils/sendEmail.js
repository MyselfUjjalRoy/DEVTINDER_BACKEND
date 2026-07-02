const { SendEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient } = require("./sesClient");

const createSendEmailCommand = (toAddress, fromAddress, subject, body) => {
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [toAddress],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: `
            <h2>🤝 New Connection Request</h2>
            <p>${body}</p>
            <br/>
            <p>Thanks for using <b>DevTinder</b>.</p>
          `,
        },
        Text: {
          Charset: "UTF-8",
          Data: body,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: "royu99099@gmail.com",
  });
};

const run = async (subject, body, recipientEmail) => {
  const sendEmailCommand = createSendEmailCommand(
    recipientEmail,
    "royu99099@gmail.com",
    subject,
    body,
  );

  try {
    const response = await sesClient.send(sendEmailCommand);

    console.log("\n========== EMAIL SENT ==========");
    console.log("To:", recipientEmail);
    console.log("Subject:", subject);
    console.dir(response, { depth: null });
    console.log("================================\n");

    return response;
  } catch (err) {
    console.log("\n========== EMAIL ERROR ==========");
    console.error(err);
    console.log("=================================\n");

    throw err;
  }
};

module.exports = { run };
