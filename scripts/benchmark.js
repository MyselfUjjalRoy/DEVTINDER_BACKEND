/**
 * benchmark.js — measures the recommender's ranking cost so you can show
 * real numbers in an interview.
 *
 * Run: `npm run bench` (or `node scripts/benchmark.js`)
 *
 * No database or running server needed: it synthesizes a realistic user base
 * in memory and times the pure ranking path that /feed actually uses.
 *
 * What it measures:
 *   1. cost to rank the whole candidate pool once (per day, via deterministic jitter)
 *   2. cost per page AFTER the pool is ranked (a memory slice — the "after" state)
 *   3. simulated cost of the OLD approach that re-shuffled/re-scored every page
 *   4. micro cost of a single compatibility calculation
 *
 * All input is seeded so results are reproducible run-to-run.
 */

const { performance } = require("perf_hooks");
const { computeCompatibility } = require("../src/utils/compatibility");
const { rankFeed } = require("../src/utils/feedRanking");

// Deterministic PRNG (mulberry32) so the synthetic user base is stable.
const createRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SKILLS_POOL = [
  "React", "React.js", "Node.js", "Express", "MongoDB", "TypeScript",
  "JavaScript", "Python", "Django", "Flask", "Go", "Rust", "Java", "Spring Boot",
  "C#", "C++", "PHP", "Ruby", "GraphQL", "Docker", "Kubernetes", "AWS",
  "Firebase", "Redis", "PostgreSQL", "Tailwind", "Next.js", "Flutter", "Dart",
];

const CITIES_POOL = [
  "Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai",
  "Kolkata", "Ahmedabad", "Jaipur", "Lucknow",
];

const GENDERS_POOL = ["Male", "Female", "Others"];

const pickN = (rand, pool, max) => {
  const count = Math.floor(rand() * max) + 1;
  const chosen = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    chosen.push(pool[idx]);
  }
  return chosen;
};

const generateCandidate = (rand, id) => ({
  _id: id,
  skills: pickN(rand, SKILLS_POOL, 6),
  location: { city: CITIES_POOL[Math.floor(rand() * CITIES_POOL.length)] },
  gender: GENDERS_POOL[Math.floor(rand() * GENDERS_POOL.length)],
});

const viewer = {
  skills: ["React", "Node.js", "MongoDB", "TypeScript"],
  location: { city: "Bangalore" },
  gender: "Male",
  preferenceSkills: new Map([
    ["react", 1.75],
    ["node", 1.5],
    ["typescript", 1.25],
  ]),
  swipeCount: 42,
};

const ms = (start) => (performance.now() - start).toFixed(2);

const formatNumber = (n) => n.toLocaleString("en-IN");

const main = () => {
  const TOTAL_USERS = 5000;
  const PAGE_SIZE = 10;
  const PAGES = 10;

  console.log("=".repeat(64));
  console.log("DevTinder recommender benchmark");
  console.log("=".repeat(64));
  console.log(`Candidates seeded:  ${formatNumber(TOTAL_USERS)}`);
  console.log(`Pages requested:    ${PAGES}  (${PAGE_SIZE} cards each)`);
  console.log("");

  const rand = createRng(20260811);
  const candidates = Array.from({ length: TOTAL_USERS }, (_, i) =>
    generateCandidate(rand, `candidate-${i}`),
  );

  const seed = "benchmark-seed";

  // Warm-up: JIT + module init so first-call cost isn't counted.
  rankFeed(viewer, candidates.slice(0, 50), { seed });

  // 1. Cost to rank the whole pool once.
  let t0 = performance.now();
  const ranked = rankFeed(viewer, candidates, { seed });
  let rankAllMs = performance.now() - t0;
  console.log(`[1] Rank entire pool once (per-day cost):        ${ms(t0)} ms`);
  console.log(`    -> ${formatNumber(Math.round(TOTAL_USERS / (rankAllMs / 1000)))} users ranked/sec`);

  // 2. Cost per page AFTER the pool is ranked (memory slice).
  t0 = performance.now();
  let pageSliceMs = 0;
  for (let p = 0; p < PAGES; p += 1) {
    const p0 = performance.now();
    ranked.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
    pageSliceMs += performance.now() - p0;
  }
  console.log(`[2] Serve ${PAGES} pages from the ranked deck:     ${pageSliceMs.toFixed(2)} ms total`);
  console.log(`    -> ${(pageSliceMs / PAGES).toFixed(3)} ms per page (no scoring, no DB)`);

  // 3. OLD behaviour: re-rank the entire pool for EVERY page (the pre-deck feed).
  t0 = performance.now();
  for (let p = 0; p < PAGES; p += 1) {
    rankFeed(viewer, candidates, { seed: `${seed}-page-${p}` });
  }
  const oldApproachMs = performance.now() - t0;
  console.log("");
  console.log("[3] OLD approach (re-score + re-shuffle per page):");
  console.log(`    -> ${oldApproachMs.toFixed(2)} ms for ${PAGES} pages (${formatNumber(TOTAL_USERS)} users scored ${PAGES}x)`);

  const speedup = oldApproachMs / (rankAllMs + pageSliceMs);
  console.log("");
  console.log("-".repeat(64));
  console.log(`Speedup of deck-then-slice vs per-page rescoring: ${speedup.toFixed(1)}x`);
  console.log("");

  // 4. Micro cost of a single compatibility computation.
  t0 = performance.now();
  const ITERATIONS = 100000;
  for (let i = 0; i < ITERATIONS; i += 1) {
    computeCompatibility(viewer, candidates[i % TOTAL_USERS]);
  }
  const microMs = performance.now() - t0;
  console.log(`[4] Single compatibility calc:                  ${(microMs / ITERATIONS * 1000).toFixed(2)} µs`);
  console.log(`    -> even 100k scorings cost ${microMs.toFixed(0)} ms total`);

  console.log("");
  console.log("Interpretation: the expensive ranking runs once, then pages are");
  console.log("cheap slices. The old feed paid the full O(N) cost on every page.");
  console.log("=".repeat(64));
};

main();
