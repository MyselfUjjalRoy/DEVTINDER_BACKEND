// Unofficial LeetCode public GraphQL client used to render a user's
// daily-submission heatmap (like GitHub's contribution grid) on profiles.
// Responses are cached in-memory to avoid hammering LeetCode.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const cache = new Map(); // username -> { data, fetchedAt }

const PROFILE_QUERY = `
  query userPublicProfile($username: String!) {
    matchedUser(username: $username) {
      submissionCalendar
      submitStats {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
  }
`;

const DAY_MS = 24 * 60 * 60 * 1000;

const gql = async (query, variables) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (DevTinder profile widget)",
        referer: "https://leetcode.com/",
      },
      body: JSON.stringify({
        operationName: "userPublicProfile",
        query,
        variables,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors.map((e) => e.message).join(", "));
    }
    return json.data || {};
  } finally {
    clearTimeout(timer);
  }
};

const extractLeetcodeUsername = (raw) => {
  if (!raw) return null;
  const value = String(raw).trim().replace(/\/+$/, "");
  if (!value) return null;

  if (/^https?:\/\//i.test(value) || /leetcode\.com/i.test(value)) {
    const match =
      value.match(/leetcode\.com\/u\/([A-Za-z0-9_\-]+)/i) ||
      value.match(/leetcode\.com\/(?:profile\/)?([A-Za-z0-9_\-]+)/i);
    return match ? match[1] : null;
  }

  return value;
};

//LeetCode's calendar keys are UTC-midnight unix timestamps (seconds).
const utcDayKey = (date) => Math.floor(date.getTime() / DAY_MS) * 86400;

const computeStreak = (calendar) => {
  if (!calendar || calendar.size === 0) return 0;

  let cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  //If today has no submissions yet, streak continues from yesterday.
  if (!calendar.has(utcDayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  let streak = 0;
  while (calendar.has(utcDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
};

const fetchLeetCodeStats = async (username) => {
  const hit = cache.get(username);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, data: hit.data, cached: true };
  }

  let data;
  try {
    data = await gql(PROFILE_QUERY, { username });
  } catch (err) {
    if (/does not exist/i.test(err.message)) {
      return {
        ok: false,
        code: 404,
        message: `No LeetCode profile found for '${username}'.`,
      };
    }
    console.error("LeetCode fetch failed:", err.message);
    return {
      ok: false,
      code: 502,
      message: "Could not reach LeetCode right now. Try again later.",
    };
  }

  const matchedUser = data?.matchedUser;
  if (!matchedUser) {
    return {
      ok: false,
      code: 404,
      message: `No LeetCode profile found for '${username}'.`,
    };
  }

  let calendar = new Map();
  try {
    calendar = new Map(Object.entries(JSON.parse(matchedUser.submissionCalendar || "{}")));
  } catch {
    calendar = new Map();
  }

  const solved = { easy: 0, medium: 0, hard: 0, total: 0 };
  const acSubmissionNum = matchedUser.submitStats?.acSubmissionNum || [];
  acSubmissionNum.forEach((d) => {
    const key = String(d.difficulty || "").toLowerCase();
    if (key in solved) {
      solved[key] = d.count;
      solved.total += d.count;
    }
  });

  const result = {
    username,
    streak: computeStreak(calendar),
    totalActiveDays: Array.from(calendar.values()).filter((c) => c > 0).length,
    submissionCalendar: matchedUser.submissionCalendar || "{}",
    solved,
    fetchedAt: Date.now(),
  };

  cache.set(username, { data: result, fetchedAt: Date.now() });
  return { ok: true, data: result };
};

module.exports = { extractLeetcodeUsername, fetchLeetCodeStats };
