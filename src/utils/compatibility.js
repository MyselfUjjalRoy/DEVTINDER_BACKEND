/**
 * compatibility.js
 *
 * A small, dependency-free "how similar are these two developers?" calculator.
 * Every function here is pure — no database, no network, no side effects —
 * so it can be unit-tested in isolation and reused anywhere in the app.
 *
 * Model (explained to non-ML people):
 *   - We compare a few signals between two profiles (skills, location).
 *   - Each signal produces a value in [0, 1] plus an effective weight.
 *   - Missing data NEVER crashes or punishes a user: the signal just gets a
 *     neutral value (0.5) and a heavily damped weight, so it barely affects
 *     the result instead of dragging it to 0.
 *   - The total is a weighted average of the signals, scaled to 0-100 and
 *     clamped so the value is always sane.
 *
 * The exact same math is reproduced in the /feed Mongo aggregation in
 * Step 2 using native operators — this file is the reference implementation
 * that keeps the numbers consistent and testable.
 */

// Default relative importance of each signal. Weights are normalized to sum 1.
const DEFAULT_WEIGHTS = {
  skills: 0.6,
  location: 0.4,
};

// A missing signal is still counted, but with this much effective weight.
// The neutral value below (0.5) times this dampen keeps unknown data from
// dominating a score built from signals we DO have.
const MISSING_DATA_DAMPEN = 0.3;

// Value used for a signal that cannot be compared (data missing on a side).
const NEUTRAL_VALUE = 0.5;

// "I don't have data" baseline. Only used when literally nothing is comparable.
const DEFAULT_TOTAL = 50;

/**
 * Common spellings for developer tech so "React.js", "ReactJS" and
 * "react js" are treated as the same skill — while keeping "C#" and "C++"
 * distinct (we never just strip punctuation).
 */
const SKILL_ALIASES = {
  react: "react",
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  node: "node",
  nodejs: "node",
  "node.js": "node",
  "node js": "node",
  express: "express",
  expressjs: "express",
  "express.js": "express",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  cpp: "c++",
  "c++": "c++",
  "c#": "csharp",
  csharp: "csharp",
  "c sharp": "csharp",
  mysql: "sql",
  sql: "sql",
  postgres: "postgresql",
  postgresql: "postgresql",
  mongo: "mongodb",
  mongodb: "mongodb",
  next: "next.js",
  nextjs: "next.js",
  "next.js": "next.js",
  "amazon web services": "aws",
  k8s: "kubernetes",
  tailwindcss: "tailwind",
  golang: "go",
  ml: "machine learning",
  "artificial intelligence": "ai",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundTo = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Normalizes a single skill to a canonical key.
 * - lowercases + trims + collapses internal whitespace
 * - maps known variants ("ReactJS" -> "react") via SKILL_ALIASES
 * Returns "" for anything unusable, so callers can safely filter.
 */
const normalizeSkill = (skill) => {
  if (!isNonEmptyString(skill)) return "";
  const collapsed = skill.trim().toLowerCase().replace(/\s+/g, " ");
  return SKILL_ALIASES[collapsed] || collapsed;
};

/**
 * Normalizes a skill list: dedupes, drops empties, maps aliases.
 * Always returns an array (never throws), even for bad input.
 */
const normalizeSkills = (skills) => {
  if (!Array.isArray(skills)) return [];
  const seen = new Set();
  const result = [];
  for (const skill of skills) {
    const normalized = normalizeSkill(skill);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

/**
 * Jaccard similarity between two already-normalized skill arrays:
 *   intersection size / union size
 * Returns 0 when either side is empty (the caller decides how to weight that).
 */
const jaccard = (skillsA, skillsB) => {
  const setA = new Set(skillsA);
  const setB = new Set(skillsB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const skill of setA) {
    if (setB.has(skill)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
};

// Neutral multiplier when the viewer has no learned preference for a skill.
const SKILL_PREFERENCE_DEFAULT = 1;

/**
 * Returns the viewer's learned affinity multiplier for a skill.
 * Works for both Mongoose Maps and plain objects. Anything unusable (missing,
 * non-numeric, <= 0) falls back to the neutral multiplier of 1.
 */
const skillPreferenceFor = (me, skill) => {
  const prefs = me && me.preferenceSkills;
  if (!prefs) return SKILL_PREFERENCE_DEFAULT;
  const raw = typeof prefs.get === "function" ? prefs.get(skill) : prefs[skill];
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : SKILL_PREFERENCE_DEFAULT;
};

/**
 * Preference-weighted skill overlap (a.k.a. weighted Jaccard).
 *
 * Shared skills count MORE when the viewer has shown affinity for them
 * (learned from swipe history). With no history every multiplier is 1, so the
 * result is identical to plain Jaccard — fully backward compatible.
 *
 * Always clamped to [0, 1]. Returns 0 when either side has no skills.
 */
const weightedSkillOverlap = (meSkills, candidateSkills, me) => {
  if (meSkills.length === 0 || candidateSkills.length === 0) return 0;
  const candidateSet = new Set(candidateSkills);
  let overlapCount = 0;
  let weightedOverlap = 0;
  for (const skill of meSkills) {
    if (candidateSet.has(skill)) {
      overlapCount += 1;
      weightedOverlap += skillPreferenceFor(me, skill);
    }
  }
  const union = meSkills.length + candidateSkills.length - overlapCount;
  if (union === 0) return 0;
  return Math.min(1, weightedOverlap / union);
};

const normalizePlace = (value) => {
  if (!isNonEmptyString(value)) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
};

/**
 * 1 when both places are present and equal, 0 when both present but different,
 * null when either side is missing (unknown).
 */
const locationScore = (cityA, cityB) => {
  const a = normalizePlace(cityA);
  const b = normalizePlace(cityB);
  if (!a || !b) return null;
  return a === b ? 1 : 0;
};

/**
 * Builds a signal: when data is present it carries its full base weight,
 * otherwise it falls back to a neutral value at a damped weight.
 */
const buildSignal = ({ baseWeight, value, hasData }) => ({
  hasData,
  value,
  weight: hasData ? baseWeight : baseWeight * MISSING_DATA_DAMPEN,
});

/**
 * Coerces an arbitrary weights object into a sane, non-negative map that
 * sums to 1. Handles missing keys, zeros, negatives, NaN and junk gracefully.
 */
const normalizeWeights = (weights) => {
  const merged = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const cleaned = {};
  for (const key of Object.keys(merged)) {
    const numeric = Number(merged[key]);
    cleaned[key] = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }
  const sum = Object.values(cleaned).reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(cleaned)) {
    cleaned[key] = cleaned[key] / sum;
  }
  return cleaned;
};

/**
 * Computes a 0-100 compatibility score between two profiles.
 *
 * @param {object|null} me         the viewer's profile (skills, location, ...)
 * @param {object|null} candidate  the profile being scored
 * @param {object}      [weights]  optional per-signal weights (defaults to DEFAULT_WEIGHTS)
 *
 * @returns {{
 *   total: number,        // rounded 0-100
 *   raw: number,          // unrounded 0-100
 *   breakdown: object     // per-signal { value (0-100), weight (0-1), hasData, contribution }
 * }}
 *
 * Never throws. Never returns NaN. Always returns a total in [0, 100].
 */
const computeCompatibility = (me, candidate, weights = DEFAULT_WEIGHTS) => {
  const effectiveWeights = normalizeWeights(weights);

  const meSkills = normalizeSkills(me && me.skills);
  const candidateSkills = normalizeSkills(candidate && candidate.skills);
  const skillsHasData = meSkills.length > 0 && candidateSkills.length > 0;

  const meCity = me && me.location && me.location.city;
  const candidateCity = candidate && candidate.location && candidate.location.city;
  const locationValue = locationScore(meCity, candidateCity);
  const locationHasData = locationValue !== null;

  const signals = {
    skills: buildSignal({
      baseWeight: effectiveWeights.skills,
      value: skillsHasData
        ? weightedSkillOverlap(meSkills, candidateSkills, me)
        : NEUTRAL_VALUE,
      hasData: skillsHasData,
    }),
    location: buildSignal({
      baseWeight: effectiveWeights.location,
      value: locationHasData ? locationValue : NEUTRAL_VALUE,
      hasData: locationHasData,
    }),
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const signal of Object.values(signals)) {
    weightedSum += signal.value * signal.weight;
    totalWeight += signal.weight;
  }

  const raw = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : DEFAULT_TOTAL;
  const clamped = clamp(raw, 0, 100);

  const breakdown = {};
  for (const [key, signal] of Object.entries(signals)) {
    breakdown[key] = {
      value: Math.round(clamp(signal.value, 0, 1) * 100),
      weight: roundTo(signal.weight, 4),
      hasData: signal.hasData,
      contribution:
        totalWeight > 0 ? roundTo((signal.value * signal.weight) / totalWeight, 4) : 0,
    };
  }

  return {
    total: Math.round(clamped),
    raw: clamped,
    breakdown,
  };
};

/**
 * Complementarity mode — the "find your co-founder" signal.
 *
 * Similarity answers "who is like me?"; complementarity answers "who brings
 * what I'm missing while still being someone I could build with?"
 *
 * Three signals:
 *   1. coverage  — the fraction of the candidate's skills that are NEW to the
 *                  viewer. This is the gap-filling signal.
 *   2. overlap   — how much they share (preference-weighted), the "can we
 *                  even collaborate?" signal.
 *   3. location  — same as similarity mode.
 *
 * A total stranger who shares nothing scores badly on overlap, and their
 * "new" skills are dampened (see MIN_OVERLAP_FOR_COVERAGE) because novelty
 * without a shared base isn't complementary — it's incommunicable. The sweet
 * spot is "shares a little, brings a lot".
 */
const DEFAULT_COMPLEMENTARITY_WEIGHTS = {
  coverage: 0.55,
  overlap: 0.25,
  location: 0.2,
};

// Below this overlap the coverage signal is scaled down smoothly. No hard
// cutoff — just a gentler reward for novelty from near-strangers.
const MIN_OVERLAP_FOR_COVERAGE = 0.2;

const computeComplementarity = (
  me,
  candidate,
  weights = DEFAULT_COMPLEMENTARITY_WEIGHTS,
) => {
  const effectiveWeights = normalizeWeights(weights);

  const meSkills = normalizeSkills(me && me.skills);
  const candidateSkills = normalizeSkills(candidate && candidate.skills);
  const skillsHasData = meSkills.length > 0 && candidateSkills.length > 0;

  const overlapValue = skillsHasData
    ? weightedSkillOverlap(meSkills, candidateSkills, me)
    : NEUTRAL_VALUE;

  const meSet = new Set(meSkills);
  const newCount = candidateSkills.filter((skill) => !meSet.has(skill)).length;
  const coverageValue = skillsHasData && candidateSkills.length > 0
    ? newCount / candidateSkills.length
    : NEUTRAL_VALUE;

  const effectiveCoverage = skillsHasData
    ? coverageValue * Math.min(1, overlapValue / MIN_OVERLAP_FOR_COVERAGE)
    : NEUTRAL_VALUE;

  const meCity = me && me.location && me.location.city;
  const candidateCity = candidate && candidate.location && candidate.location.city;
  const locationValue = locationScore(meCity, candidateCity);
  const locationHasData = locationValue !== null;

  const signals = {
    coverage: buildSignal({
      baseWeight: effectiveWeights.coverage,
      value: effectiveCoverage,
      hasData: skillsHasData,
    }),
    overlap: buildSignal({
      baseWeight: effectiveWeights.overlap,
      value: overlapValue,
      hasData: skillsHasData,
    }),
    location: buildSignal({
      baseWeight: effectiveWeights.location,
      value: locationHasData ? locationValue : NEUTRAL_VALUE,
      hasData: locationHasData,
    }),
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const signal of Object.values(signals)) {
    weightedSum += signal.value * signal.weight;
    totalWeight += signal.weight;
  }

  const raw = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : DEFAULT_TOTAL;
  const clamped = clamp(raw, 0, 100);

  const breakdown = {};
  for (const [key, signal] of Object.entries(signals)) {
    breakdown[key] = {
      value: Math.round(clamp(signal.value, 0, 1) * 100),
      weight: roundTo(signal.weight, 4),
      hasData: signal.hasData,
      contribution:
        totalWeight > 0
          ? roundTo((signal.value * signal.weight) / totalWeight, 4)
          : 0,
    };
  }

  return {
    total: Math.round(clamped),
    raw: clamped,
    breakdown,
  };
};

module.exports = {
  DEFAULT_WEIGHTS,
  MISSING_DATA_DAMPEN,
  NEUTRAL_VALUE,
  DEFAULT_TOTAL,
  SKILL_PREFERENCE_DEFAULT,
  DEFAULT_COMPLEMENTARITY_WEIGHTS,
  MIN_OVERLAP_FOR_COVERAGE,
  normalizeSkill,
  normalizeSkills,
  jaccard,
  skillPreferenceFor,
  weightedSkillOverlap,
  normalizeWeights,
  computeCompatibility,
  computeComplementarity,
};
