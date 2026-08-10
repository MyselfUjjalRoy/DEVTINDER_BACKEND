/**
 * feedSeen.js — the Tinder-style "seen pile" (Step 6).
 *
 * Realistic feeds never reshuffle the same faces back at you. Tinder builds a
 * deck of people you haven't already swiped and serves NEW people on refresh.
 *
 * Here we do the same, with one important rule (matching Tinder):
 *   - `seenIds` (capped array on the user) remembers every card the user has
 *     DECIDED on — liked, ignored, super-connected, accepted or rejected.
 *     Merely LOOKING at a card never consumes it.
 *   - `/feed` builds its deck as "eligible minus seen", so a card you swiped
 *     never comes back, while a card you haven't decided on stays in the deck
 *     across refreshes until you act on it.
 *   - When the user has genuinely decided on everyone, the feed returns [] and
 *     the frontend shows its existing "Deck Cleared!" state (honest exhaustion,
 *     exactly like Tinder's "You're all caught up").
 *
 * `filterSeen` is pure and unit-tested — it is the exact code the feed runs.
 * `markSeen` is best-effort persistence: a failure never breaks the feed or
 * the swipe request, it just logs (same contract as feedback.js).
 */

const mongoose = require("mongoose");
const User = require("../models/user");

// Rotates old cards out so a small user pool eventually cycles back in.
const MAX_SEEN_IDS = 100;

/**
 * Normalizes a list of ids (ObjectIds, strings, mixed, junk) into a Set of
 * lowercase string keys. Never throws; junk entries are dropped.
 */
const seenKeys = (seenIds) => {
  const set = new Set();
  if (!Array.isArray(seenIds)) return set;
  for (const id of seenIds) {
    if (id === null || id === undefined) continue;
    const key = String(id);
    if (!key) continue;
    set.add(key);
  }
  return set;
};

/**
 * Returns only the candidates the user has NOT already seen.
 *
 * @param {object[]} candidates  lean user docs (must include _id)
 * @param {Array}    seenIds     the viewer's user.seenIds (mixed types ok)
 * @returns {object[]} candidates minus the seen ones (same order)
 */
const filterSeen = (candidates, seenIds) => {
  if (!Array.isArray(candidates)) return [];
  const seen = seenKeys(seenIds);
  if (seen.size === 0) return candidates;
  return candidates.filter((candidate) => candidate && !seen.has(String(candidate._id)));
};

/**
 * Coerces ids to valid mongoose ObjectIds, dropping anything unusable.
 */
const toObjectIds = (ids) => {
  const result = [];
  for (const id of ids || []) {
    if (!id) continue;
    try {
      result.push(new mongoose.Types.ObjectId(id));
    } catch {
      // not a valid ObjectId — skip it
    }
  }
  return result;
};

/**
 * Records that a user has seen a set of cards (best-effort).
 *
 * Two steps because $addToSet (dedupe) and $push $slice (cap) can't share a
 * path in one update: add the new ids, then trim the array to MAX_SEEN_IDS.
 *
 * @param {string|ObjectId} userId  the viewer
 * @param {Array}           ids     the delivered card ids
 * @param {object}          [opts]  { limit } override (tests)
 * @returns {Promise<void>}
 */
const markSeen = async (userId, ids, opts = {}) => {
  const validIds = toObjectIds(ids);
  if (validIds.length === 0) return;
  const limit = opts.limit || MAX_SEEN_IDS;

  try {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { seenIds: { $each: validIds } },
    });
    await User.findByIdAndUpdate(userId, {
      $push: { seenIds: { $each: [], $slice: -limit } },
    });
  } catch (err) {
    // The seen-pile is a UX nicety — it must never break the request.
    console.error("[feedSeen] failed to persist seen pile:", err.message);
  }
};

module.exports = {
  MAX_SEEN_IDS,
  seenKeys,
  filterSeen,
  toObjectIds,
  markSeen,
};
