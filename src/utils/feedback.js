/**
 * feedback.js — the recommender's feedback loop (Step 3).
 *
 * Every swipe decision (like/ignore, accept/reject, super connect) teaches the
 * viewer's profile which skills they actually connect with:
 *   - liking someone   bumps the affinity multiplier of that person's skills
 *   - ignoring someone lowers it
 *
 * The multiplier is stored in `user.preferenceSkills` (normalized skill ->
 * number) and is read by compatibility.weightedSkillOverlap when scoring the
 * feed. Changes are capped so no single action (or spam) can dominate.
 *
 * Learning is best-effort: a failure here NEVER fails the swipe request —
 * it just logs. That keeps the critical path (sending/accepting a request)
 * independent from the recommendation layer.
 */

const { normalizeSkills } = require("./compatibility");

// Bounds + step size for per-skill affinity multipliers.
const SKILL_PREFERENCE_MIN = 0.25;
const SKILL_PREFERENCE_MAX = 2;
const SKILL_PREFERENCE_STEP = 0.25;

const SWIPE_ACTIONS = Object.freeze({
  LIKE: "like",
  IGNORE: "ignore",
});

const readPreference = (prefs, skill) => {
  if (!prefs) return 1;
  const raw = typeof prefs.get === "function" ? prefs.get(skill) : prefs[skill];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 1;
};

const writePreference = (prefs, skill, value) => {
  if (typeof prefs.set === "function") prefs.set(skill, value);
  else prefs[skill] = value;
};

const clampPreference = (value) =>
  Math.min(SKILL_PREFERENCE_MAX, Math.max(SKILL_PREFERENCE_MIN, value));

const ensurePreferenceMap = (user) => {
  if (!user.preferenceSkills) user.preferenceSkills = new Map();
  return user.preferenceSkills;
};

/**
 * Applies one swipe decision to the viewer's learned preferences.
 *
 * @param {object} user    the viewer (mongoose doc or plain object with .save())
 * @param {object} target  the profile that was liked/ignored
 * @param {string} action  SWIPE_ACTIONS.LIKE or SWIPE_ACTIONS.IGNORE
 *
 * @returns {Promise<number>} the new swipe count (for observability)
 */
const applySwipeFeedback = async (user, target, action) => {
  if (!user || !target) return Number(user && user.swipeCount) || 0;

  const direction = action === SWIPE_ACTIONS.LIKE ? 1 : -1;
  const skills = normalizeSkills(target.skills);
  const prefs = ensurePreferenceMap(user);

  for (const skill of skills) {
    const next = clampPreference(
      readPreference(prefs, skill) + direction * SKILL_PREFERENCE_STEP,
    );
    writePreference(prefs, skill, next);
  }

  user.swipeCount = Number(user.swipeCount || 0) + 1;

  try {
    if (typeof user.save === "function") {
      await user.save();
    }
  } catch (err) {
    // Learning must never break the swipe request itself.
    console.error("[feedback] failed to persist preferences:", err.message);
  }

  return user.swipeCount;
};

module.exports = {
  SKILL_PREFERENCE_MIN,
  SKILL_PREFERENCE_MAX,
  SKILL_PREFERENCE_STEP,
  SWIPE_ACTIONS,
  applySwipeFeedback,
};
