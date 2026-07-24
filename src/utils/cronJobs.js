const cron = require("node-cron");
const ConnectionRequestModel = require("../models/connectionRequest");
const { subDays, startOfDay, endOfDay } = require("date-fns");
const sendEmail = require("./sendEmail");

cron.schedule("0 8 * * *", async () => {
  //Send Emails to all people who got requests the previous day

  try {
    const yesterday = subDays(new Date(), 1);
    const yesterdayStart = startOfDay(yesterday);
    const yesterdayEnd = endOfDay(yesterday);

    const pendingRequests = await ConnectionRequestModel.find({
      status: "interested",
      createdAt: {
        $gte: yesterdayStart,
        $lt: yesterdayEnd,
      },
    }).populate("fromUserId toUserId");

    // Group requests by recipient email address
    const emailToRequestsMap = {};
    for (const req of pendingRequests) {
      if (req.toUserId && req.toUserId.emailId) {
        const email = req.toUserId.emailId;
        if (!emailToRequestsMap[email]) {
          emailToRequestsMap[email] = [];
        }
        emailToRequestsMap[email].push(req);
      }
    }

    console.log(
      "Found requests grouped by email:",
      Object.keys(emailToRequestsMap),
    );

    for (const email of Object.keys(emailToRequestsMap)) {
      try {
        const requests = emailToRequestsMap[email];

        // Get the unique sender names
        const senderNames = [
          ...new Set(
            requests
              .map((req) => {
                const fromUser = req.fromUserId;
                if (fromUser) {
                  const firstName = fromUser.firstName || "";
                  const lastName = fromUser.lastName || "";
                  return (firstName + " " + lastName).trim();
                }
                return "Someone";
              })
              .filter((name) => name.length > 0),
          ),
        ];

        const recipientName = requests[0].toUserId.firstName || "there";

        let subject = "";
        let body = "";

        if (senderNames.length === 1) {
          subject = "New connection request pending from " + senderNames[0];
          body =
            "Hi " +
            recipientName +
            ", you have a pending connection request from " +
            senderNames[0] +
            " on DevFinder!";
        } else if (senderNames.length > 1) {
          subject =
            "You have " + senderNames.length + " pending connection requests";
          body =
            "Hi " +
            recipientName +
            ", you have pending connection requests from: " +
            senderNames.join(", ") +
            " on DevFinder!";
        } else {
          subject = "New friend requests pending";
          body =
            "Hi " +
            recipientName +
            ", you have pending friend requests on DevFinder!";
        }

        const emailRes = await sendEmail.run(subject, body, email);
        console.log("Cron job sent email to", email, "response:", emailRes);
      } catch (err) {
        console.error("Failed to send cron email to " + email, err);
      }
    }
  } catch (err) {
    console.error(err);
  }
});
