const express = require("express");
const authRouter = express.Router();

const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const { validateSignUpData } = require("../utils/validation");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const validator = require("validator");

const toSafeUser = (user) => {
  const safe = user.toObject ? user.toObject() : { ...user };
  delete safe.password;
  return safe;
};

const setAuthCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 3600000),
    sameSite: "lax",
  });
};

const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:7777";
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env");
  }
  return new OAuth2Client(clientId, clientSecret, `${backendUrl}/auth/google/callback`);
};

authRouter.post("/signup", async (req, res) => {
  try {
    //1. Validation of data
    validateSignUpData(req);

    const { firstName, lastName, emailId, password } = req.body;

    //2. Encrypt the password
    const passwordHash = await bcrypt.hash(password, 10);

    //3. Create new user
    const user = new User({
      firstName,
      lastName,
      emailId,
      password: passwordHash,
    });
    const savedUser = await user.save();

    //4. Log them in right away
    const token = await savedUser.getJWT();
    setAuthCookie(res, token);

    res.status(201).json({
      message: "User created successfully",
      data: toSafeUser(savedUser),
    });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;

    if (!validator.isEmail(emailId)) {
      throw new Error("Email Id not valid");
    }

    //1. find user in the DB
    const user = await User.findOne({ emailId: String(emailId).trim().toLowerCase() });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    //2. compare the password
    const isPswdValid = await user.validatePswd(password);
    if (!isPswdValid) {
      throw new Error("Invalid credentials");
    }

    const token = await user.getJWT();
    setAuthCookie(res, token);

    res.send(toSafeUser(user));
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

authRouter.post("/logout", async (req, res) => {
  //Expiring the cookie right there when the user calls this API
  res.cookie("token", null, {
    expires: new Date(Date.now()), //expiry time -> current time
  });
  res.send("Logout Successful");
});

// Step 1: Redirect the user to Google's consent screen.
// Point the "Sign in with Google" button at GET /auth/google.
authRouter.get("/auth/google", (req, res) => {
  try {
    const client = getGoogleOAuthClient();

    // Random state value that is verified on the callback to prevent CSRF.
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("google_oauth_state", state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: "lax",
    });

    const authUrl = client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    });

    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send("ERROR: " + err.message);
  }
});

// Step 2: Google redirects back here with a `code`. We exchange it for the
// user's verified identity, then create or log in the user like normal.
authRouter.get("/auth/google/callback", async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { code, state, error } = req.query;

  const failRedirect = (message) => {
    res.redirect(`${clientUrl}/login?googleAuth=error&message=${encodeURIComponent(message)}`);
  };

  try {
    if (error) {
      return failRedirect(error);
    }

    if (!code) {
      return failRedirect("Google did not return an authorization code");
    }

    // CSRF protection: the state in the callback must match the one we set.
    if (!state || state !== req.cookies.google_oauth_state) {
      return failRedirect("Invalid OAuth state. Please try again.");
    }
    res.clearCookie("google_oauth_state");

    const client = getGoogleOAuthClient();

    // 1. Exchange the code for tokens (id_token contains the verified profile).
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // 2. Verify the id_token signature/audience. This is the trust anchor.
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified) {
      return failRedirect("Google email is not verified");
    }

    const emailId = payload.email.toLowerCase();
    const firstName = (payload.given_name || payload.name || "Google User").slice(0, 50);
    const lastName = (payload.family_name || "").slice(0, 50);

    // 3. Find or create the user.
    let user = await User.findOne({ googleId: payload.sub });
    let isNewUser = false;

    if (!user) {
      user = await User.findOne({ emailId });
      if (!user) {
        // New user: create with the Google profile data.
        user = new User({
          firstName,
          lastName,
          emailId,
          googleId: payload.sub,
          photoURL: payload.picture || undefined,
        });
        await user.save();
        isNewUser = true;
      } else {
        // Email already registered with a password: link the Google account.
        user.googleId = payload.sub;
        await user.save();
      }
    }

    // 4. Issue the same JWT cookie used by email/password login.
    const token = await user.getJWT();
    setAuthCookie(res, token);

    // New Google users are sent to /profile to finish setting up their profile;
    // everyone else goes straight to the feed.
    res.redirect(`${clientUrl}/login?googleAuth=success${isNewUser ? "&newUser=1" : ""}`);
  } catch (err) {
    res.redirect(`${clientUrl}/login?googleAuth=error&message=${encodeURIComponent(err.message)}`);
  }
});

const getGitHubOAuthConfig = () => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:7777";
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env");
  }
  return { clientId, clientSecret, redirectUri: `${backendUrl}/auth/github/callback` };
};

// Step 1: Redirect the user to GitHub's authorization screen.
authRouter.get("/auth/github", (req, res) => {
  try {
    const { clientId, redirectUri } = getGitHubOAuthConfig();

    // Random state value verified on the callback to prevent CSRF.
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("github_oauth_state", state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      sameSite: "lax",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
      allow_signup: "true",
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  } catch (err) {
    res.status(500).send("ERROR: " + err.message);
  }
});

// Step 2: GitHub redirects back here with a `code`. Exchange it for a token,
// fetch the user's profile, then create or log in the user like normal.
authRouter.get("/auth/github/callback", async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { code, state, error } = req.query;

  const failRedirect = (message) => {
    res.redirect(`${clientUrl}/login?githubAuth=error&message=${encodeURIComponent(message)}`);
  };

  try {
    if (error) {
      return failRedirect(error);
    }

    if (!code) {
      return failRedirect("GitHub did not return an authorization code");
    }

    // CSRF protection: the state in the callback must match the one we set.
    if (!state || state !== req.cookies.github_oauth_state) {
      return failRedirect("Invalid OAuth state. Please try again.");
    }
    res.clearCookie("github_oauth_state");

    const { clientId, clientSecret, redirectUri } = getGitHubOAuthConfig();

    // 1. Exchange the code for an access token.
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return failRedirect("Could not obtain a GitHub access token");
    }
    const accessToken = tokenData.access_token;

    // 2. Fetch the GitHub profile.
    const profileRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "DevTinder",
      },
    });
    const profile = await profileRes.json();
    if (!profile || !profile.id) {
      return failRedirect("Could not fetch your GitHub profile");
    }

    // 3. Fetch emails — GitHub hides emails by default, so use the dedicated
    // endpoint and prefer the primary + verified address.
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "DevTinder",
      },
    });
    const emails = await emailsRes.json();
    const emailObj =
      (Array.isArray(emails) && emails.find((e) => e.primary && e.verified)) ||
      (Array.isArray(emails) && emails.find((e) => e.verified)) ||
      null;
    const emailId = (emailObj && emailObj.email) || `${profile.login}@users.noreply.github.com`;

    const nameParts = (profile.name || profile.login || "GitHub User").trim().split(/\s+/);
    const firstName = (nameParts[0] || "GitHub").slice(0, 50);
    const lastName = nameParts.slice(1).join(" ").slice(0, 50);

    // 4. Find or create the user.
    let user = await User.findOne({ githubId: String(profile.id) });
    let isNewUser = false;

    if (!user) {
      user = await User.findOne({ emailId: String(emailId).toLowerCase() });
      if (!user) {
        // New user: create with the GitHub profile data.
        user = new User({
          firstName,
          lastName,
          emailId: String(emailId).toLowerCase(),
          githubId: String(profile.id),
          photoURL: profile.avatar_url || undefined,
        });
        await user.save();
        isNewUser = true;
      } else {
        // Email already registered with a password: link the GitHub account.
        user.githubId = String(profile.id);
        await user.save();
      }
    }

    // 5. Issue the same JWT cookie used by email/password and Google login.
    const token = await user.getJWT();
    setAuthCookie(res, token);

    // New GitHub users are sent to /profile to finish setting up their profile;
    // everyone else goes straight to the feed.
    res.redirect(`${clientUrl}/login?githubAuth=success${isNewUser ? "&newUser=1" : ""}`);
  } catch (err) {
    res.redirect(`${clientUrl}/login?githubAuth=error&message=${encodeURIComponent(err.message)}`);
  }
});

module.exports = authRouter;
