/**
 * deckCache.js — in-memory TTL cache for the ranked feed deck.
 *
 * WHY:
 *   Every /feed request was re-running the full O(N) ranking pass over the
 *   entire candidate pool, even when nothing changed since the last refresh.
 *   A page reload = a full re-score of every user. This cache keeps each
 *   user's RANKED DECK (the exact array rankFeed() returns) in memory, so a
 *   page request just slices the cached deck and fetches the page's full
 *   profiles with $in. The expensive ranking runs at most once per TTL
 *   window per user.
 *
 * CORRECTNESS CONTRACT — invalidate exactly when the ranking inputs change:
 *   - a swipe (like / ignore / super connect / accept / reject): feedback
 *     changes the viewer's learned preferences AND the seen-pile grows, so
 *     the viewer's own deck must be rebuilt.
 *   - a connection request is sent/reviewed: both users now hide each other
 *     (the feed excludes everyone you have a request with), so BOTH decks
 *     are invalidated.
 *   - someone super-connects WITH the viewer: the "starredYou" boost
 *     reorders the recipient's deck, so the recipient's cache is cleared.
 *   - the viewer edits their own profile: the scorer's inputs changed.
 *
 *   TTL is the bounded-staleness backstop for everything else (new signups,
 *   other users editing their profiles, membership changes...) — those
 *   propagate within TTL minutes. That is the classic cache trade-off, and
 *   15 minutes is invisible to a user browsing the feed.
 *
 * KEYING:
 *   cacheKey = `${userId}|${YYYY-MM-DD}|${mode}`. The per-day deterministic
 *   jitter (feedRanking) reseeds at midnight, so a new day must build a fresh
 *   deck. The mode ("similar" | "complementary") is part of the key because
 *   the two modes rank the same pool with different scores — switching modes
 *   must not leak one deck's order into the other. Invalidation clears every
 *   mode for a user.
 *
 * STATS:
 *   hits / misses are tracked for observability — the /feed response sets an
 *   `x-cache: HIT | MISS` header and GET /user/cache-stats returns the counts,
 *   so the cache's effect is provable in the browser network tab.
 */

const TTL_MS = 15 * 60 * 1000;

const cache = new Map();

let hits = 0;
let misses = 0;

// The per-day seed in feedRanking uses the viewer id + UTC date.
const todayKey = () => new Date().toISOString().slice(0, 10);

const cacheKey = (userId, mode = "similar") =>
  `${String(userId)}|${todayKey()}|${mode}`;

/**
 * Returns the cached deck entry for a user, or null on miss/expiry.
 * @returns {{deck: object[], starredIds: string[]} | null}
 */
const get = (userId, mode = "similar") => {
  const key = cacheKey(userId, mode);
  const entry = cache.get(key);
  if (!entry) {
    misses += 1;
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    misses += 1;
    return null;
  }
  hits += 1;
  return { deck: entry.deck, starredIds: entry.starredIds };
};

/**
 * Stores the freshly built ranked deck for a user.
 * @param {string|object} userId
 * @param {object[]} deck         the array rankFeed() returned (ranked best-first)
 * @param {Array} starredIds      users who super-connected with the viewer
 * @param {string} [mode]         "similar" | "complementary" (default "similar")
 */
const set = (userId, deck, starredIds = [], mode = "similar") => {
  const key = cacheKey(userId, mode);
  cache.set(key, {
    deck,
    starredIds: starredIds.map((id) => String(id)),
    expiresAt: Date.now() + TTL_MS,
  });
  // Lazy prune of expired entries keeps the map bounded without a timer.
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(k);
  }
};

/**
 * Drops a user's cached decks in every mode (call when any ranking input
 * changed — both similar and complementary decks depend on the same inputs).
 */
const invalidate = (userId) => {
  const prefix = `${String(userId)}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

const stats = () => {
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total === 0 ? 0 : Number((hits / total).toFixed(3)),
    size: cache.size,
    ttlMs: TTL_MS,
  };
};

const clear = () => {
  cache.clear();
  hits = 0;
  misses = 0;
};

module.exports = { TTL_MS, get, set, invalidate, stats, clear, cacheKey };
