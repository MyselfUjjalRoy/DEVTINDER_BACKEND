/**
 * matchReasons.js — human-readable "why we matched" reasons for each feed card.
 *
 * The recommender is fully explainable: every score already carries a breakdown
 * (compatibility.js), and this module turns that into short sentences a user
 * can actually read — "You both know React", "You've liked Node devs before".
 *
 * Pure + dependency-light (only reuses compatibility helpers), so it is
 * unit-testable and runs in the hot /feed path for free (no I/O).
 *
 * Reason priority:
 *   1. starredYou  — they super-connected with you
 *   2. learned affinity — you've liked devs with these skills before
 *   3. shared skills
 *   4. same city
 *   5. fallback — strong overall match (never an empty card)
 */

const {
  normalizeSkills,
  skillPreferenceFor,
} = require("./compatibility");

const MAX_REASONS = 4;

// A preference multiplier at/above this means the viewer has demonstrably
// liked this skill before (feedback loop caps affinity at 2.0, default is 1).
const AFFINITY_THRESHOLD = 1.5;

// Keep the most common aliases looking human in the UI.
const PRETTY_SKILLS = {
  csharp: "C#",
  "c++": "C++",
  javascript: "JavaScript",
  typescript: "TypeScript",
  next: "Next.js",
  "next.js": "Next.js",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  node: "Node.js",
  react: "React",
};

const prettifySkill = (skill) => {
  const key = String(skill || "").trim().toLowerCase();
  return PRETTY_SKILLS[key] || String(skill || "").trim();
};

/**
 * "a", "a and b" or "a, b and 1 more" — compact, readable skill lists.
 */
const formatSkillList = (skills) => {
  const cleaned = skills.map(prettifySkill).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  const shown = cleaned.slice(0, 2);
  const rest = cleaned.length - 2;
  return `${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
};

/**
 * Skills present on BOTH profiles (normalized, alias-aware), in the
 * candidate's own wording.
 */
const sharedSkills = (viewer, candidate) => {
  const mine = new Set(normalizeSkills(viewer && viewer.skills));
  return normalizeSkills(candidate && candidate.skills).filter((skill) =>
    mine.has(skill),
  );
};

const sameCity = (viewer, candidate) => {
  const a = viewer && viewer.location && viewer.location.city;
  const b = candidate && candidate.location && candidate.location.city;
  if (!a || !b) return null;
  const cityA = String(a).trim().toLowerCase();
  const cityB = String(b).trim().toLowerCase();
  if (cityA !== cityB) return null;
  // Prefer the viewer's spelling — their own profile is the curated one.
  return String(a).trim() || String(b).trim();
};

/**
 * Builds the reasons for one feed card.
 *
 * @param {object} viewer     the logged-in user (needs .skills, .location,
 *                            .preferenceSkills for affinity)
 * @param {object} candidate  the card's lean profile (+ .score from ranking)
 * @param {object} [options]  { starredYou: boolean, mode: "similar" | "complementary" }
 * @returns {string[]} up to MAX_REASONS short sentences
 */
const generateMatchReasons = (viewer, candidate, options = {}) => {
  const { starredYou = false, mode = "similar" } = options || {};
  const reasons = [];

  if (starredYou) {
    reasons.push("Super-connected with your profile ⭐");
  }

  const shared = sharedSkills(viewer, candidate);
  if (shared.length > 0) {
    const liked = shared.filter(
      (skill) => skillPreferenceFor(viewer, skill) >= AFFINITY_THRESHOLD,
    );
    if (liked.length > 0) {
      reasons.push(`You've liked developers who know ${formatSkillList(liked)}`);
    }
    reasons.push(`You both know ${formatSkillList(shared)}`);
  }

  if (mode === "complementary") {
    const mine = new Set(normalizeSkills(viewer && viewer.skills));
    const brings = normalizeSkills(candidate && candidate.skills).filter(
      (skill) => !mine.has(skill),
    );
    if (brings.length > 0) {
      reasons.push(
        `Knows ${formatSkillList(brings)} you don't — fills your stack's gaps`,
      );
    }
  }

  const city = sameCity(viewer, candidate);
  if (city) {
    reasons.push(`You're both in ${city}`);
  }

  if (reasons.length === 0) {
    const score = Number.isFinite(candidate && candidate.score)
      ? `${candidate.score}%`
      : "high";
    reasons.push(
      mode === "complementary"
        ? `Strong complementary match (${score})`
        : `Strong overall match (${score} compatibility)`,
    );
  }

  return reasons.slice(0, MAX_REASONS);
};

module.exports = {
  MAX_REASONS,
  AFFINITY_THRESHOLD,
  formatSkillList,
  sharedSkills,
  generateMatchReasons,
};
