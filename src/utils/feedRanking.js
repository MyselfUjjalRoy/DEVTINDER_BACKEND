/**
 * feedRanking.js
 *
 * Composes the pure compatibility scorer with feed ordering.
 *
 * Why score in Node instead of the Mongo aggregation?
 *   - The exact same computeCompatibility() function that's unit-tested is
 *     used here, so the feed can never drift from the tested math (one source
 *     of truth, no duplicated aggregation logic).
 *   - Only a light projection (_id, skills, location, gender) is fetched, then
 *     the page's full profiles are fetched with $in — two queries total, no N+1.
 *   - Ties are broken with a deterministic per-day jitter, so pagination is
 *     STABLE: the same user can never appear on two different pages (the old
 *     $rand pipeline reshuffled on every request, which caused duplicates).
 *
 * Order (most important first):
 *   1. starredYou  — anyone who super-connected with me in the last 24h
 *   2. score       — compatibility (0-100)
 *   3. genderPref  — legacy preference nudge among equal scores
 *   4. jitter      — deterministic randomness (variety, daily reseed)
 */

const { computeCompatibility } = require("./compatibility");

// FNV-1a string hash -> unsigned 32-bit. Deterministic across runs/processes.
const hashString = (str) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Stable pseudo-random value in [0, 1) for a candidate, derived from the
 * candidate id and a seed. The same (candidate, seed) always yields the same
 * jitter, which is what makes pagination deterministic within a day.
 */
const deterministicJitter = (candidateId, seed) => {
  const hash = hashString(`${String(candidateId)}|${seed}`);
  return (hash % 1000003) / 1000003;
};

/**
 * Ranks a list of candidate lean docs for the viewer.
 *
 * @param {object} viewer        the logged-in user (mongoose doc or plain object)
 * @param {object[]} candidates  lean user docs (must include _id, skills, location, gender)
 * @param {object} [options]
 *   - starredIds:  ObjectIds of users who super-connected with the viewer recently
 *   - preferGender: optional "male"/"female" to nudge ahead among equal scores
 *   - seed:        string used for the deterministic tie-break jitter
 *
 * @returns {object[]} the same candidate objects, each with a `score` property,
 *                     sorted best-first.
 */
const rankFeed = (viewer, candidates, options = {}) => {
  const { starredIds = [], preferGender = null, seed = "default" } = options;

  const starred = new Set(starredIds.map((id) => String(id)));
  const prefer =
    typeof preferGender === "string" ? preferGender.toLowerCase() : null;

  const scored = candidates.map((candidate) => {
    const id = String(candidate._id);

    let genderNudge = 0;
    if (prefer && typeof candidate.gender === "string") {
      const candidateGender = candidate.gender.toLowerCase();
      genderNudge = candidateGender === prefer ? 0 : 1;
    }

    const compat = computeCompatibility(viewer, candidate);

    return {
      candidate,
      score: compat.total,
      breakdown: compat.breakdown,
      starred: starred.has(id) ? 0 : 1,
      genderNudge,
      jitter: deterministicJitter(id, seed),
    };
  });

  scored.sort(
    (a, b) =>
      a.starred - b.starred ||
      b.score - a.score ||
      a.genderNudge - b.genderNudge ||
      a.jitter - b.jitter,
  );

  // Attach the score + breakdown to each candidate so the route can include
  // them in the response.
  const ranked = scored.map((entry) => {
    entry.candidate.score = entry.score;
    entry.candidate.breakdown = entry.breakdown;
    return entry.candidate;
  });

  return ranked;
};

module.exports = { rankFeed, hashString, deterministicJitter };
