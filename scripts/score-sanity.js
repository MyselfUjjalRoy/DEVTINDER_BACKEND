/**
 * score-sanity.js — lightweight self-check for src/utils/compatibility.js.
 *
 * No test framework needed: run with `node scripts/score-sanity.js`
 * (or `npm run test:compat`). Prints PASS/FAIL per case and exits
 * non-zero if anything is wrong, so it can gate CI later.
 */

const assert = require("assert");
const {
  DEFAULT_WEIGHTS,
  computeCompatibility,
  normalizeSkill,
  normalizeSkills,
  jaccard,
  normalizeWeights,
  weightedSkillOverlap,
} = require("../src/utils/compatibility");
const {
  rankFeed,
  deterministicJitter,
} = require("../src/utils/feedRanking");
const {
  SKILL_PREFERENCE_MIN,
  SKILL_PREFERENCE_MAX,
  SWIPE_ACTIONS,
  applySwipeFeedback,
} = require("../src/utils/feedback");
const { seenKeys, filterSeen } = require("../src/utils/feedSeen");
const deckCache = require("../src/utils/deckCache");

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name} — ${err.message}`);
  }
};

const fullProfile = (overrides = {}) => ({
  firstName: "Test",
  skills: ["React", "Node.js", "MongoDB"],
  location: { city: "Bangalore", country: "India" },
  ...overrides,
});

const isFiniteInRange = (n, min, max) =>
  Number.isFinite(n) && n >= min && n <= max;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("normalizeSkill maps common variants to one canonical key", () => {
  assert.strictEqual(normalizeSkill("React.js"), "react");
  assert.strictEqual(normalizeSkill("  REACTJS  "), "react");
  assert.strictEqual(normalizeSkill("react js"), "react");
  assert.strictEqual(normalizeSkill("NodeJS"), "node");
});

test("normalizeSkill keeps C# and C++ distinct", () => {
  assert.notStrictEqual(normalizeSkill("C#"), normalizeSkill("C++"));
  assert.strictEqual(normalizeSkill("C#"), "csharp");
  assert.strictEqual(normalizeSkill("C++"), "c++");
});

test("normalizeSkill returns '' for junk", () => {
  assert.strictEqual(normalizeSkill(undefined), "");
  assert.strictEqual(normalizeSkill(null), "");
  assert.strictEqual(normalizeSkill(""), "");
  assert.strictEqual(normalizeSkill("   "), "");
  assert.strictEqual(normalizeSkill(42), "");
});

test("normalizeSkills dedupes, filters empties and never throws", () => {
  assert.deepStrictEqual(
    normalizeSkills(["React", "react", "react.js", "", "   ", null, "Node"]),
    ["react", "node"],
  );
  assert.deepStrictEqual(normalizeSkills(undefined), []);
  assert.deepStrictEqual(normalizeSkills("not-an-array"), []);
});

test("jaccard: identical sets = 1, disjoint = 0, partial in between", () => {
  assert.strictEqual(jaccard(["react", "node"], ["react", "node"]), 1);
  assert.strictEqual(jaccard(["react"], ["node"]), 0);
  assert.strictEqual(jaccard(["react", "node"], ["react", "go"]), 1 / 3);
  assert.strictEqual(jaccard([], ["react"]), 0);
});

test("normalizeWeights clamps to non-negative and renormalizes to sum 1", () => {
  const weights = normalizeWeights({ skills: 2, location: -5, junk: "x" });
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Object.values(weights).every((w) => Number.isFinite(w) && w >= 0));
  assert.deepStrictEqual(normalizeWeights({ skills: 0, location: 0 }), DEFAULT_WEIGHTS);
  assert.deepStrictEqual(normalizeWeights(null), DEFAULT_WEIGHTS);
});

// ---------------------------------------------------------------------------
// computeCompatibility behaviour
// ---------------------------------------------------------------------------

test("identical full profiles score exactly 100", () => {
  const me = fullProfile();
  const result = computeCompatibility(me, fullProfile());
  assert.strictEqual(result.total, 100);
});

test("disjoint skills + same city -> weighted average (skills 0 + location 1)", () => {
  const me = fullProfile();
  const candidate = fullProfile({
    skills: ["Go", "Rust", "Dart"],
    location: { city: "Bangalore" },
  });
  const result = computeCompatibility(me, candidate);
  assert.strictEqual(result.total, 40); // (0*0.6 + 1*0.4) / 1
});

test("disjoint skills + different city -> 0 (both signals comparable)", () => {
  const me = fullProfile();
  const candidate = fullProfile({
    skills: ["Go"],
    location: { city: "Mumbai" },
  });
  assert.strictEqual(computeCompatibility(me, candidate).total, 0);
});

test("no skills anywhere + no location -> baseline 50, never crashes", () => {
  const me = { firstName: "A" };
  const candidate = { firstName: "B" };
  const result = computeCompatibility(me, candidate);
  assert.strictEqual(result.total, 50);
});

test("missing skills + same city -> neutral signal is damped, city dominates", () => {
  const me = fullProfile({ skills: [] });
  const candidate = fullProfile({
    skills: undefined,
    location: { city: "bangalore" },
  });
  const result = computeCompatibility(me, candidate);
  // (0.5*0.18 + 1*0.4) / 0.58 = 84.48 -> 84
  assert.strictEqual(result.total, 84);
  assert.strictEqual(result.breakdown.skills.hasData, false);
  assert.strictEqual(result.breakdown.location.hasData, true);
});

test("aliased skills still count as a perfect skill match", () => {
  const me = fullProfile({ skills: ["React.js", "NodeJS"] });
  const candidate = fullProfile({ skills: ["react js", "node.js"] });
  assert.strictEqual(computeCompatibility(me, candidate).total, 100);
});

test("null / undefined inputs are safe and score the baseline", () => {
  assert.strictEqual(computeCompatibility(null, null).total, 50);
  assert.strictEqual(computeCompatibility(undefined, fullProfile()).total >= 0, true);
  assert.strictEqual(computeCompatibility({}, {}).total, 50);
});

test("nested location can be null without breaking", () => {
  const me = fullProfile({ location: null });
  const candidate = fullProfile({ location: { city: "Bangalore" } });
  const result = computeCompatibility(me, candidate);
  assert.ok(isFiniteInRange(result.total, 0, 100));
  assert.strictEqual(result.breakdown.location.hasData, false);
});

test("city matching is case-insensitive and trims whitespace", () => {
  const me = fullProfile({ location: { city: "  Bengaluru " } });
  const candidate = fullProfile({ location: { city: "bengaluru" } });
  assert.strictEqual(computeCompatibility(me, candidate).total, 100);
});

test("junk weights never produce NaN or out-of-range totals", () => {
  const me = fullProfile();
  const candidate = fullProfile({ skills: ["Go"] });
  for (const weights of [
    { skills: NaN, location: -3 },
    { skills: Infinity, location: 0 },
    { skills: "abc", location: null },
  ]) {
    const result = computeCompatibility(me, candidate, weights);
    assert.ok(isFiniteInRange(result.total, 0, 100), `bad weights: ${JSON.stringify(weights)}`);
  }
});

test("breakdown contributions sum to the raw score and values stay in 0-100", () => {
  const me = fullProfile();
  const candidate = fullProfile({ skills: ["React", "Go"], location: { city: "Mumbai" } });
  const result = computeCompatibility(me, candidate);
  // Each contribution is the fraction of the final score a signal provided,
  // so they must add up to the raw score (on a 0-1 scale), not 1.
  const sum = Object.values(result.breakdown).reduce((a, s) => a + s.contribution, 0);
  assert.ok(Math.abs(sum - result.raw / 100) < 0.01);
  for (const signal of Object.values(result.breakdown)) {
    assert.ok(isFiniteInRange(signal.value, 0, 100), "signal value out of range");
  }
});

test("fuzz: 1000 random profiles never crash and always score 0-100", () => {
  const SKILLS_POOL = ["React", "Node", "Go", "Python", "C#", "C++", "Java", "Rust", "Dart", ""];
  const CITIES_POOL = ["Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad", null];

  const randomProfile = (seed) => {
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const skills = Array.from({ length: Math.floor(rand() * 6) }, () =>
      SKILLS_POOL[Math.floor(rand() * SKILLS_POOL.length)],
    );
    return {
      skills,
      location: CITIES_POOL[Math.floor(rand() * CITIES_POOL.length)]
        ? { city: CITIES_POOL[Math.floor(rand() * CITIES_POOL.length)] }
        : null,
    };
  };

  for (let i = 0; i < 1000; i += 1) {
    const me = randomProfile(i * 2 + 1);
    const candidate = randomProfile(i * 2 + 2);
    const result = computeCompatibility(me, candidate);
    if (!isFiniteInRange(result.total, 0, 100)) {
      throw new Error(`fuzz case ${i} produced total=${result.total}`);
    }
  }
});

// ---------------------------------------------------------------------------
// rankFeed (Step 2: feed integration)
// ---------------------------------------------------------------------------

const makeCandidate = (id, { skills = [], city = null, gender = null } = {}) => ({
  _id: id,
  skills,
  location: city ? { city } : null,
  gender,
});

test("rankFeed orders by compatibility score, highest first", () => {
  const viewer = fullProfile(); // React/Node/MongoDB, Bangalore
  const best = makeCandidate("a", { skills: ["React", "Node"], city: "Bangalore" });
  const mid = makeCandidate("b", { skills: ["React"], city: "Mumbai" });
  const worst = makeCandidate("c", { skills: ["Go"], city: "Mumbai" });
  const ranked = rankFeed(viewer, [worst, best, mid], { seed: "s" });
  assert.deepStrictEqual(
    ranked.map((c) => String(c._id)),
    ["a", "b", "c"],
  );
});

test("rankFeed attaches score to every candidate", () => {
  const viewer = fullProfile();
  const ranked = rankFeed(viewer, [makeCandidate("a", { skills: ["React"] })], { seed: "s" });
  assert.ok(Number.isInteger(ranked[0].score) && ranked[0].score >= 0 && ranked[0].score <= 100);
  assert.ok(ranked[0].breakdown && typeof ranked[0].breakdown.skills.value === "number");
});

test("rankFeed boosts starred (superliked) users to the top", () => {
  const viewer = fullProfile();
  const star = makeCandidate("a", { skills: ["Go"], city: "Mumbai" }); // low score
  const good = makeCandidate("b", { skills: ["React", "Node"], city: "Bangalore" });
  const ranked = rankFeed(viewer, [good, star], { starredIds: ["a"], seed: "s" });
  assert.strictEqual(String(ranked[0]._id), "a"); // starred even though worse match
});

test("rankFeed gender preference only nudges ties, never overrides score", () => {
  const viewer = fullProfile();
  const pref = makeCandidate("a", { skills: ["React", "Node"], city: "Mumbai", gender: "Female" });
  const other = makeCandidate("b", { skills: ["React", "Node"], city: "Mumbai", gender: "Male" });
  // Same skills + same city -> identical score. Gender nudge decides.
  const ranked = rankFeed(viewer, [other, pref], { preferGender: "female", seed: "s" });
  assert.strictEqual(String(ranked[0]._id), "a");
});

test("rankFeed is deterministic for the same seed", () => {
  const viewer = fullProfile();
  const candidates = Array.from({ length: 20 }, (_, i) =>
    makeCandidate(`id-${i}`, {
      skills: ["React"],
      location: { city: "Bangalore" },
    }),
  );
  const a = rankFeed(viewer, candidates, { seed: "day-1" }).map((c) => String(c._id));
  const b = rankFeed(viewer, candidates, { seed: "day-1" }).map((c) => String(c._id));
  assert.deepStrictEqual(a, b);
});

test("rankFeed pages never overlap within the same day (no duplicate cards)", () => {
  const viewer = fullProfile();
  const candidates = Array.from({ length: 50 }, (_, i) =>
    makeCandidate(`id-${i}`, {
      skills: i % 2 ? ["React"] : ["Go"],
      city: i % 3 ? "Bangalore" : "Mumbai",
    }),
  );
  const ranked = rankFeed(viewer, candidates, { seed: "same-day" }).map((c) => String(c._id));
  const page1 = new Set(ranked.slice(0, 10));
  const page2 = ranked.slice(10, 20);
  const overlap = page2.filter((id) => page1.has(id));
  assert.deepStrictEqual(overlap, []);
});

test("rankFeed only adds `score` and `breakdown` and handles empty input", () => {
  const viewer = fullProfile();
  assert.deepStrictEqual(rankFeed(viewer, [], { seed: "s" }), []);
  const candidate = makeCandidate("a", { skills: ["React"] });
  const keysBefore = Object.keys(candidate).sort();
  const ranked = rankFeed(viewer, [candidate], { seed: "s" });
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(String(ranked[0]._id), "a");
  assert.deepStrictEqual(
    Object.keys(candidate).sort(),
    [...keysBefore, "score", "breakdown"].sort(),
  );
  assert.ok(Number.isInteger(candidate.score) && candidate.score >= 0 && candidate.score <= 100);
});

test("deterministicJitter is stable and in [0, 1)", () => {
  assert.strictEqual(deterministicJitter("id-1", "seed"), deterministicJitter("id-1", "seed"));
  const value = deterministicJitter("id-1", "seed");
  assert.ok(value >= 0 && value < 1);
});

// ---------------------------------------------------------------------------
// feedSeen (Step 6: the Tinder-style seen-pile)
// ---------------------------------------------------------------------------

test("filterSeen keeps unseen candidates, drops seen ones", () => {
  const candidates = [
    makeCandidate("a", { skills: ["React"] }),
    makeCandidate("b", { skills: ["Node"] }),
    makeCandidate("c", { skills: ["Go"] }),
  ];
  const filtered = filterSeen(candidates, ["b"]);
  assert.deepStrictEqual(
    filtered.map((c) => String(c._id)),
    ["a", "c"],
  );
});

test("filterSeen is robust to ObjectId, string and mixed ids", () => {
  const candidates = [
    makeCandidate("507f1f77bcf86cd799439011", { skills: ["React"] }),
    makeCandidate("507f1f77bcf86cd799439012", { skills: ["Node"] }),
    makeCandidate("plain-id", { skills: ["Go"] }),
  ];
  const filtered = filterSeen(candidates, ["507f1f77bcf86cd799439011", "plain-id"]);
  assert.deepStrictEqual(
    filtered.map((c) => String(c._id)),
    ["507f1f77bcf86cd799439012"],
  );
});

test("filterSeen drops junk ids and never throws", () => {
  const candidates = [makeCandidate("a", { skills: ["React"] })];
  assert.strictEqual(
    filterSeen(candidates, [null, undefined, 0, ""]).length,
    candidates.length,
  );
  assert.strictEqual(filterSeen(candidates, [12345]).length, candidates.length);
  assert.deepStrictEqual(filterSeen(null, ["a"]), []);
  assert.deepStrictEqual(filterSeen([{ noId: true }], ["a"]), [{ noId: true }]);
});

test("filterSeen with empty seen pile keeps everything", () => {
  const candidates = [makeCandidate("a"), makeCandidate("b")];
  assert.strictEqual(filterSeen(candidates, null).length, 2);
  assert.strictEqual(filterSeen(candidates, []).length, 2);
});

test("seenKeys dedupes and stringifies every id", () => {
  const keys = seenKeys(["a", "a", 5, { toString: () => "obj" }]);
  assert.ok(keys.has("a") && keys.has("5") && keys.has("obj"));
  assert.strictEqual(keys.size, 3);
});

test("the seen-pile only removes cards the user decided on (swipe-driven)", () => {
  const viewer = fullProfile(); // React/Node/MongoDB, Bangalore
  const deck = [
    makeCandidate("a", { skills: ["React"], city: "Bangalore" }),
    makeCandidate("b", { skills: ["Node"], city: "Bangalore" }),
    makeCandidate("c", { skills: ["Go"], city: "Mumbai" }),
  ];
  // User liked 'a' -> 'a' joins the pile and leaves the deck.
  const deckAfterLike = filterSeen(deck, ["a"]);
  assert.deepStrictEqual(
    deckAfterLike.map((c) => String(c._id)),
    ["b", "c"],
  );
  // Refreshing WITHOUT new swipes changes nothing: no card is consumed.
  const afterRefresh = filterSeen(deck, ["a"]);
  assert.deepStrictEqual(
    afterRefresh.map((c) => String(c._id)),
    ["b", "c"],
  );
  // Full exhaustion -> empty deck (frontend shows "Deck Cleared!").
  assert.strictEqual(filterSeen(deck, ["a", "b", "c"]).length, 0);
});

// ---------------------------------------------------------------------------
// feedback loop (Step 3: preferences + weighted scoring)
// ---------------------------------------------------------------------------

const makeFakeUser = (prefs) => {
  const doc = { preferenceSkills: new Map(Object.entries(prefs || {})), swipeCount: 0 };
  doc.save = async () => undefined;
  return doc;
};

const prefMap = (user) => Object.fromEntries(user.preferenceSkills.entries());

test("like bumps the affinity of the target's skills", async () => {
  const user = makeFakeUser();
  await applySwipeFeedback(user, { skills: ["React", "Go"] }, SWIPE_ACTIONS.LIKE);
  assert.strictEqual(prefMap(user).react, 1.25);
  assert.strictEqual(prefMap(user).go, 1.25);
});

test("ignore lowers the affinity of the target's skills", async () => {
  const user = makeFakeUser({ react: 1 });
  await applySwipeFeedback(user, { skills: ["React"] }, SWIPE_ACTIONS.IGNORE);
  assert.strictEqual(prefMap(user).react, 0.75);
});

test("preferences are capped so spam can't dominate", async () => {
  const user = makeFakeUser({ react: SKILL_PREFERENCE_MAX - 0.1, go: SKILL_PREFERENCE_MIN + 0.1 });
  await applySwipeFeedback(user, { skills: ["React", "Go"] }, SWIPE_ACTIONS.LIKE);
  assert.ok(prefMap(user).react <= SKILL_PREFERENCE_MAX);
  await applySwipeFeedback(user, { skills: ["Go"] }, SWIPE_ACTIONS.IGNORE);
  assert.ok(prefMap(user).go >= SKILL_PREFERENCE_MIN);
});

test("swipeCount increments and empty-skill targets never crash", async () => {
  const user = makeFakeUser();
  await applySwipeFeedback(user, { skills: [] }, SWIPE_ACTIONS.LIKE);
  await applySwipeFeedback(user, { skills: undefined }, SWIPE_ACTIONS.IGNORE);
  await applySwipeFeedback(user, null, SWIPE_ACTIONS.LIKE);
  assert.strictEqual(user.swipeCount, 2);
  assert.deepStrictEqual(prefMap(user), {});
});

test("failed save never throws (learning is best-effort)", async () => {
  const user = { preferenceSkills: new Map(), swipeCount: 0, save: () => { throw new Error("db down"); } };
  await applySwipeFeedback(user, { skills: ["React"] }, SWIPE_ACTIONS.LIKE);
  assert.strictEqual(prefMap(user).react, 1.25);
});

test("liked skills amplify the skill signal vs plain Jaccard", () => {
  const viewer = fullProfile({ preferenceSkills: new Map([["react", 2]]) }); // React/Node/MongoDB, Bangalore
  const candidate = fullProfile({ skills: ["React"], location: { city: "Bangalore" } });
  const learned = computeCompatibility(viewer, candidate).total;
  const cold = computeCompatibility(fullProfile(), candidate).total;
  // weighted overlap = pref(react)/union = 2/3 = 0.667 -> (0.667*0.6 + 1*0.4) = 80
  // plain jaccard overlap = 1/3 = 0.333 -> (0.333*0.6 + 1*0.4) = 60
  assert.strictEqual(learned, 80);
  assert.strictEqual(cold, 60);
});

test("no preference history behaves exactly like plain Jaccard", () => {
  const viewer = fullProfile();
  const candidate = fullProfile({ skills: ["React"], location: { city: "Mumbai" } });
  const meSkills = normalizeSkills(viewer.skills);
  const candidateSkills = normalizeSkills(candidate.skills);
  assert.strictEqual(weightedSkillOverlap(meSkills, candidateSkills, viewer), jaccard(meSkills, candidateSkills));
  assert.strictEqual(weightedSkillOverlap(meSkills, candidateSkills, null), jaccard(meSkills, candidateSkills));
});

test("affinity only amplifies the skills actually liked", () => {
  const viewer = fullProfile({ preferenceSkills: new Map([["react", 2]]) });
  // candidate shares only `node`, not the liked `react` -> plain jaccard result
  const candidate = fullProfile({ skills: ["Node"], location: { city: "Bangalore" } });
  const learned = computeCompatibility(viewer, candidate).total;
  const cold = computeCompatibility(fullProfile(), candidate).total;
  assert.strictEqual(learned, cold);
});

// ---------------------------------------------------------------------------
// computeComplementarity (Feature B: the co-founder mode)
// ---------------------------------------------------------------------------

const {
  computeComplementarity,
  DEFAULT_COMPLEMENTARITY_WEIGHTS,
  MIN_OVERLAP_FOR_COVERAGE,
} = require("../src/utils/compatibility");

test("complementarity rewards 'shares a bit, brings a lot' over clones and strangers", () => {
  const me = fullProfile(); // React/Node/MongoDB, Bangalore
  const bitAndLot = fullProfile({ skills: ["React", "Go", "Rust", "Dart", "Java"], location: { city: "Bangalore" } });
  const clone = fullProfile({ location: { city: "Bangalore" } }); // identical skills
  const stranger = fullProfile({ skills: ["Go", "Rust", "Dart"], location: { city: "Bangalore" } }); // zero shared
  const bit = computeComplementarity(me, bitAndLot).total;
  const same = computeComplementarity(me, clone).total;
  const none = computeComplementarity(me, stranger).total;
  assert.ok(bit > same, `expected bit-and-lot (${bit}) > clone (${same})`);
  assert.ok(bit > none, `expected bit-and-lot (${bit}) > stranger (${none})`);
});

test("complementarity never crashes on missing data and stays 0-100", () => {
  assert.strictEqual(computeComplementarity(null, null).total, 50);
  assert.strictEqual(computeComplementarity({}, {}).total, 50);
  assert.ok(isFiniteInRange(computeComplementarity({ skills: ["Go"] }, {}).total, 0, 100));
  assert.ok(isFiniteInRange(computeComplementarity({}, { skills: ["Go"] }).total, 0, 100));
});

test("complementarity breakdown exposes coverage, overlap and location", () => {
  const me = fullProfile();
  const candidate = fullProfile({ skills: ["React", "Go"], location: { city: "Mumbai" } });
  const result = computeComplementarity(me, candidate);
  const keys = Object.keys(result.breakdown).sort();
  assert.deepStrictEqual(keys, ["coverage", "location", "overlap"]);
  const sum = Object.values(result.breakdown).reduce((a, s) => a + s.contribution, 0);
  assert.ok(Math.abs(sum - result.raw / 100) < 0.01);
  assert.ok(isFiniteInRange(result.total, 0, 100));
});

test("complementarity default weights are normalized to sum 1", () => {
  const sum = Object.values(DEFAULT_COMPLEMENTARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(MIN_OVERLAP_FOR_COVERAGE > 0);
});

test("rankFeed in complementary mode reorders by the complementary scorer", () => {
  const viewer = fullProfile(); // React/Node/MongoDB, Bangalore
  const gapFiller = makeCandidate("a", { skills: ["React", "Go", "Rust"], city: "Bangalore" });
  const clone = makeCandidate("b", { skills: ["React", "Node", "MongoDB"], city: "Mumbai" });
  const similar = rankFeed(viewer, [gapFiller, clone], { seed: "s" });
  const complementary = rankFeed(viewer, [gapFiller, clone], { seed: "s", mode: "complementary" });
  assert.strictEqual(String(similar[0]._id), "b"); // clone scores higher on similarity
  assert.strictEqual(String(complementary[0]._id), "a"); // gap-filler wins complementarity
  assert.ok(complementary[0].breakdown.coverage && typeof complementary[0].breakdown.coverage.value === "number");
});

// ---------------------------------------------------------------------------
// matchReasons (Feature A1: "why we matched" explainability)
// ---------------------------------------------------------------------------

const {
  generateMatchReasons,
  formatSkillList,
  sharedSkills,
  MAX_REASONS,
} = require("../src/utils/matchReasons");

test("shared skills with the viewer produce a 'you both know' reason", () => {
  const me = fullProfile(); // React/Node/MongoDB, Bangalore
  const candidate = makeCandidate("a", { skills: ["React", "Go"], city: "Mumbai" });
  const reasons = generateMatchReasons(me, candidate);
  assert.ok(reasons.some((r) => r.includes("You both know") && r.includes("React")));
});

test("aliased skill spellings still count as shared skills", () => {
  const me = fullProfile();
  const candidate = makeCandidate("a", { skills: ["react js", "node.js"], city: "Mumbai" });
  const reasons = generateMatchReasons(me, candidate);
  assert.ok(reasons.some((r) => r.includes("React")));
});

test("learned affinity adds a 'liked developers who know' reason", () => {
  const me = fullProfile({ preferenceSkills: new Map([["react", 2]]) });
  const candidate = makeCandidate("a", { skills: ["React"], city: "Mumbai" });
  const reasons = generateMatchReasons(me, candidate);
  assert.ok(reasons.some((r) => r.includes("You've liked developers who know React")));
});

test("same city adds a location reason (viewer's spelling wins)", () => {
  const me = fullProfile(); // Bangalore
  const candidate = makeCandidate("a", { skills: ["Go"], city: "bangalore" });
  const reasons = generateMatchReasons(me, candidate);
  assert.ok(reasons.some((r) => r.includes("You're both in Bangalore")));
});

test("starredYou reason is listed first", () => {
  const me = fullProfile();
  const candidate = makeCandidate("a", { skills: ["React", "Node", "MongoDB"], city: "Bangalore" });
  const reasons = generateMatchReasons(me, candidate, { starredYou: true });
  assert.strictEqual(reasons[0], "Super-connected with your profile ⭐");
});

test("nothing in common falls back to a strong-match reason, never an empty list", () => {
  const me = fullProfile();
  const candidate = makeCandidate("a", { skills: ["Go"], city: "Mumbai" });
  const reasons = generateMatchReasons(me, candidate);
  assert.ok(reasons.length > 0);
  assert.ok(reasons[0].includes("Strong overall match"));
});

test("reasons are capped at MAX_REASONS and never duplicated", () => {
  const me = fullProfile();
  const candidate = makeCandidate("a", { skills: ["React", "Node", "MongoDB"], city: "Bangalore" });
  const reasons = generateMatchReasons(me, candidate, { starredYou: true });
  assert.ok(reasons.length <= MAX_REASONS);
  assert.strictEqual(new Set(reasons).size, reasons.length);
});

test("formatSkillList renders 1, 2 and 3+ skills readably", () => {
  assert.strictEqual(formatSkillList(["React"]), "React");
  assert.strictEqual(formatSkillList(["React", "node"]), "React and Node.js");
  const three = formatSkillList(["React", "node", "Go"]);
  assert.ok(three.includes("React") && three.includes("and 1 more"));
});

test("sharedSkills normalizes aliases across both profiles", () => {
  const me = fullProfile();
  assert.deepStrictEqual(sharedSkills(me, { skills: ["react.js", "nodejs", "Go"] }), ["react", "node"]);
  assert.deepStrictEqual(sharedSkills(me, {}), []);
});

test("matchReasons never throws on junk or empty profiles", () => {
  assert.strictEqual(generateMatchReasons(null, null)[0], "Strong overall match (high compatibility)");
  assert.strictEqual(generateMatchReasons({}, {})[0], "Strong overall match (high compatibility)");
  assert.ok(Array.isArray(generateMatchReasons({ skills: null }, { skills: "x" })));
  assert.ok(Array.isArray(generateMatchReasons({}, null, { starredYou: true })));
});

test("matchReasons adds a gap-filling reason in complementary mode", () => {
  const me = fullProfile(); // React/Node/MongoDB
  const candidate = makeCandidate("a", { skills: ["React", "Go", "Rust"], city: "Mumbai" });
  const reasons = generateMatchReasons(me, candidate, { mode: "complementary" });
  assert.ok(reasons.some((r) => r.includes("fills your stack's gaps")));
  // Similar mode never mentions gap-filling.
  const similarReasons = generateMatchReasons(me, candidate, { mode: "similar" });
  assert.ok(!similarReasons.some((r) => r.includes("gaps")));
});

// ---------------------------------------------------------------------------
// ai.js icebreaker fallback (Feature A2: AI openers, deterministic degrades)
// ---------------------------------------------------------------------------

const {
  fallbackIcebreaker,
  buildPrompt,
  sanitize,
} = require("../src/utils/ai");

test("fallbackIcebreaker mentions shared skills when they exist", () => {
  const me = fullProfile({ firstName: "Aarav" }); // React/Node/MongoDB, Bangalore
  const other = fullProfile({ firstName: "Priya", skills: ["react js", "Go"] });
  const text = fallbackIcebreaker(me, other);
  assert.ok(text.includes("React"));
});

test("fallbackIcebreaker falls back to city, then to a generic opener", () => {
  const noSharedSkills = fallbackIcebreaker(
    fullProfile({ skills: ["Go"] }),
    fullProfile({ skills: ["Rust"], location: { city: "Mumbai" } }),
  );
  assert.ok(noSharedSkills.includes("Mumbai"));

  const generic = fallbackIcebreaker(null, null);
  assert.ok(generic.includes("matched") || generic.includes("working on"));
});

test("buildPrompt only contains structured fields, never free-form bio", () => {
  const me = { firstName: "A", skills: ["React"], work: { role: "SDE" } };
  const other = { firstName: "B", location: { city: "Delhi" } };
  const prompt = buildPrompt(me, other);
  assert.ok(prompt.includes("Skills: React"));
  assert.ok(prompt.includes("City: Delhi"));
  assert.ok(!prompt.includes("undefined"));
});

test("sanitize collapses whitespace and trims", () => {
  assert.strictEqual(sanitize("  Hello\n  world!  \n"), "Hello world!");
  assert.strictEqual(sanitize(null), "");
  assert.strictEqual(sanitize(undefined), "");
});

// ---------------------------------------------------------------------------
// icebreaker model: canonical pair key (Feature A2)
// ---------------------------------------------------------------------------

const Icebreaker = require("../src/models/icebreaker");

test("canonicalPair always orders ids deterministically", () => {
  const { Types } = require("mongoose");
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();
  const ab = Icebreaker.canonicalPair(a, b);
  const ba = Icebreaker.canonicalPair(b, a);
  assert.deepStrictEqual(ab, ba);
  assert.ok(String(ab[0]) <= String(ab[1]));
});

test("canonicalPair handles string ids of different lengths", () => {
  const pair = Icebreaker.canonicalPair("999", "aaaa");
  assert.deepStrictEqual(pair, ["999", "aaaa"]);
  assert.deepStrictEqual(Icebreaker.canonicalPair("aaaa", "999"), ["999", "aaaa"]);
});

// ---------------------------------------------------------------------------
// deckCache (Step 7: the ranked-deck cache)
// ---------------------------------------------------------------------------

test("deckCache get on an empty cache returns null and counts a miss", () => {
  deckCache.clear();
  assert.strictEqual(deckCache.get("user-1"), null);
  assert.strictEqual(deckCache.stats().misses, 1);
  assert.strictEqual(deckCache.stats().hits, 0);
});

test("deckCache set then get returns the deck and its starred ids", () => {
  deckCache.clear();
  const deck = [{ _id: "a", score: 90 }, { _id: "b", score: 70 }];
  deckCache.set("user-1", deck, ["x", "y"]);
  const entry = deckCache.get("user-1");
  assert.deepStrictEqual(entry.deck, deck);
  assert.deepStrictEqual(entry.starredIds, ["x", "y"]);
  assert.strictEqual(deckCache.stats().hits, 1);
});

test("deckCache invalidate drops the entry and forces a rebuild", () => {
  deckCache.clear();
  deckCache.set("user-1", [{ _id: "a" }], []);
  assert.deepStrictEqual(deckCache.get("user-1"), {
    deck: [{ _id: "a" }],
    starredIds: [],
  });
  deckCache.invalidate("user-1");
  assert.strictEqual(deckCache.get("user-1"), null);
  assert.strictEqual(deckCache.stats().hitRate, 0.5); // 1 hit + 1 miss
});

test("deckCache key is per user AND per day AND per mode", () => {
  const { cacheKey } = require("../src/utils/deckCache");
  assert.notStrictEqual(
    cacheKey("user-1").slice(0, "user-1".length),
    cacheKey("user-2").slice(0, "user-2".length),
  );
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(cacheKey("user-1").includes(date));
  assert.strictEqual(cacheKey("user-1"), `user-1|${date}|similar`);
  assert.notStrictEqual(
    cacheKey("user-1", "complementary"),
    cacheKey("user-1", "similar"),
  );
  assert.ok(cacheKey("user-1", "complementary").endsWith("complementary"));
});

test("deckCache modes are isolated and invalidate clears both", () => {
  deckCache.clear();
  deckCache.set("user-1", [{ _id: "a" }], [], "similar");
  deckCache.set("user-1", [{ _id: "b" }], [], "complementary");
  assert.strictEqual(deckCache.get("user-1", "similar").deck[0]._id, "a");
  assert.strictEqual(deckCache.get("user-1", "complementary").deck[0]._id, "b");
  deckCache.invalidate("user-1");
  assert.strictEqual(deckCache.get("user-1", "similar"), null);
  assert.strictEqual(deckCache.get("user-1", "complementary"), null);
});

test("deckCache set/get round-trips ObjectIds as string starred ids", () => {
  deckCache.clear();
  const { Types } = require("mongoose");
  const oid = new Types.ObjectId();
  deckCache.set("user-1", [{ _id: "a" }], [oid]);
  assert.deepStrictEqual(deckCache.get("user-1").starredIds, [String(oid)]);
});

// ---------------------------------------------------------------------------

console.log("\ncompatibility.js sanity check\n");
console.log(`\n\x1b[36m${passed} passed, ${failed} failed\x1b[0m\n`);

if (failed > 0) {
  process.exit(1);
}
