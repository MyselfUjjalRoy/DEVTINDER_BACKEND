/**
 * sync-indexes.js — idempotent, production-safe index deployment.
 *
 * Run: `npm run sync-indexes` (after every schema change that adds/removes
 * an index definition).
 *
 * WHY this script exists:
 *   - In development mongoose's autoIndex builds indexes for you. In
 *     production you want explicit, auditable index creation.
 *   - We use `Model.createIndexes()` (NOT `syncIndexes()`): createIndexes is
 *     idempotent and NEVER drops anything, so running it is safe while old
 *     app versions are still serving traffic. syncIndexes() can drop indexes
 *     that aren't in the schema, which breaks a second app version mid-deploy.
 *
 * The schema files are the single source of truth for index definitions;
 * this script just applies them to the live database.
 */

require("dotenv").config();

const connectDB = require("../src/config/database");
const User = require("../src/models/user");
const ConnectionRequest = require("../src/models/connectionRequest");
const SuperLike = require("../src/models/superLike");

const MODELS = [User, ConnectionRequest, SuperLike];

const main = async () => {
  await connectDB();

  for (const model of MODELS) {
    const t0 = Date.now();
    await model.createIndexes();
    const indexes = await model.listIndexes();
    console.log(
      `[sync-indexes] ${model.modelName}: ${indexes.length} index(es) ensured ` +
        `in ${Date.now() - t0} ms`,
    );
    for (const index of indexes) {
      const { v, key, name, ...opts } = index;
      const optsStr = Object.keys(opts).length ? ` (${JSON.stringify(opts)})` : "";
      console.log(`    - ${name}: ${JSON.stringify(key)}${optsStr}`);
    }
  }

  console.log("[sync-indexes] Done.");
  process.exit(0);
};

main().catch((err) => {
  console.error("[sync-indexes] FAILED:", err.message);
  process.exit(1);
});
