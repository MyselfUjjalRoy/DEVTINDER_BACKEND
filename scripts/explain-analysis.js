/**
 * explain-analysis.js — proves (with Mongo's query planner) that the hot
 * queries now use indexes instead of scanning whole collections.
 *
 * Run: `npm run explain` (requires a running DB; it connects via .env).
 *
 * For each hot query it prints the winning plan stage (IXSCAN vs COLLSCAN),
 * the index actually used, how many documents Mongo HAD to examine versus how
 * many it returned, and the execution time. The numbers you want to show:
 *   - IXSCAN with the right compound index -> totalDocsExamined ≈ nReturned
 *   - COLLSCAN would be totalDocsExamined ≈ full collection size
 *
 * This is the after-state; the before-state was COLLSCAN on toUserId-only
 * lookups before the { toUserId, status } index existed.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const ConnectionRequest = require("../src/models/connectionRequest");
const SuperLike = require("../src/models/superLike");
const User = require("../src/models/user");

const now = () => new Date();

const analyze = async (name, query) => {
  const result = await query.explain("executionStats");
  const stats = result.executionStats;
  const stage = result.queryPlanner.winningPlan;

  const stageName =
    (stage.queryPlan && stage.queryPlan.stage) ||
    stage.inputStage?.stage ||
    stage.stage ||
    "?";
  const indexUsed =
    (stage.inputStage && stage.inputStage.indexName) || stage.indexName || "-";

  const examined = stats.totalDocsExamined;
  const returned = stats.nReturned;
  const ratio =
    returned === 0 ? "n/a" : `${(examined / returned).toFixed(0)} doc(s) per result`;

  console.log(`\n[${name}]`);
  console.log(`  stage:            ${stageName}`);
  console.log(`  index used:       ${indexUsed}`);
  console.log(`  docs examined:    ${examined}`);
  console.log(`  docs returned:    ${returned}`);
  console.log(`  examined:returned ${ratio}`);
  console.log(`  time:             ${stats.executionTimeMillis} ms`);

  return { examined, returned, stageName };
};

const main = async () => {
  await connectDB();
  console.log("Database connected.");

  const sampleUser = await User.findOne().select("_id").lean();
  if (!sampleUser) {
    console.error("No users in DB — cannot run the analysis.");
    process.exit(1);
  }
  const userId = sampleUser._id;
  const nowDate = now();
  console.log(`Sample user: ${String(userId)}`);
  console.log(`Collection sizes: ConnectionRequest=${await ConnectionRequest.estimatedDocumentCount()}, ` +
    `SuperLike=${await SuperLike.estimatedDocumentCount()}, User=${await User.estimatedDocumentCount()}`);

  const total = [
    ["Requests received (toUserId + status)", ConnectionRequest.find({ toUserId: userId, status: "interested" })],
    ["Feed hidden-set: outgoing branch (fromUserId)", ConnectionRequest.find({ fromUserId: userId })],
    ["Feed hidden-set: incoming branch (toUserId)", ConnectionRequest.find({ toUserId: userId })],
    ["Connections: incoming accepted (toUserId + status)", ConnectionRequest.find({ toUserId: userId, status: "accepted" })],
    ["Connections: outgoing accepted (fromUserId + status)", ConnectionRequest.find({ fromUserId: userId, status: "accepted" })],
    ["SuperLike duplicate check (fromUserId + toUserId)", SuperLike.find({ fromUserId: userId, toUserId: userId })],
    ["SuperLike feed boost (toUserId + createdAt)", SuperLike.find({ toUserId: userId, createdAt: { $gte: nowDate } })],
  ];

  for (const [name, query] of total) {
    try {
      await analyze(name, query);
    } catch (err) {
      console.log(`\n[${name}] ERROR: ${err.message}`);
    }
  }

  console.log("\nInterpretation: every row should show IXSCAN (index scan) and a");
  console.log("small examined:returned ratio. COLLSCAN = whole-collection scan.");
  process.exit(0);
};

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
