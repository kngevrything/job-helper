const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env.local");
}

// Case-insensitive equivalent of the unique index on { company, jobId }
// defined in src/models/JobApplication.ts (see DUPLICATE_MATCH_COLLATION
// there for why this exists -- e.g. the Chrome extension's Greenhouse
// scraper can produce "SecurityScorecard" via one fallback tier and
// "Securityscorecard" via another, and those should count as the same
// company).
//
// Mongoose won't change an *existing* index's options for you on a
// running database -- if the index is already there with different
// options, MongoDB errors (IndexOptionsConflict) rather than replacing
// it. This script is the "by hand, once" migration: it checks for
// casing-variant duplicates that already exist under the old
// case-sensitive index first (MongoDB will flatly refuse to build a
// case-insensitive unique index while those exist), and only touches
// the index if none are found. It never merges or deletes application
// data on its own -- if duplicates are found, it prints them and stops,
// so you can decide by hand which record(s) to keep.
//
// Run once: node scripts/migrateCaseInsensitiveDupeIndex.js
// (or: npm run migrate-case-insensitive-dupe-index)

const INDEX_KEY = { company: 1, jobId: 1 };
const COLLATION = { locale: "en", strength: 2 };

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "jobtracker" });
  const collection = mongoose.connection.db.collection("jobapplications");

  console.log("Checking for existing casing-variant duplicates...");

  const dupeGroups = await collection
    .aggregate([
      {
        $group: {
          _id: {
            company: { $toLower: "$company" },
            jobId: { $toLower: "$jobId" },
          },
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: "$_id",
              company: "$company",
              jobId: "$jobId",
              createdAt: "$createdAt",
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (dupeGroups.length > 0) {
    console.error(
      `Found ${dupeGroups.length} group(s) of casing-variant duplicates. ` +
        "Resolve these by hand (merge or delete the record(s) you don't " +
        "want to keep) and re-run this script -- MongoDB will refuse to " +
        "build a case-insensitive unique index while these exist.\n"
    );
    for (const group of dupeGroups) {
      console.error(`${group._id.company} / ${group._id.jobId}:`);
      for (const doc of group.docs) {
        console.error(
          `  _id=${doc._id}  company="${doc.company}"  jobId="${doc.jobId}"  createdAt=${doc.createdAt}`
        );
      }
      console.error("");
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("No casing-variant duplicates found. Proceeding.\n");

  const existingIndexes = await collection.indexes();
  const oldIndex = existingIndexes.find(
    (idx) =>
      JSON.stringify(idx.key) === JSON.stringify(INDEX_KEY) && !idx.collation
  );

  if (oldIndex) {
    console.log(`Dropping old case-sensitive index "${oldIndex.name}"...`);
    await collection.dropIndex(oldIndex.name);
  } else {
    console.log(
      "No matching case-sensitive index found to drop (already migrated?)."
    );
  }

  console.log("Creating case-insensitive unique index...");
  await collection.createIndex(INDEX_KEY, {
    unique: true,
    collation: COLLATION,
    name: "company_1_jobId_1",
  });

  console.log("\nDone. Current indexes on jobapplications:");
  const finalIndexes = await collection.indexes();
  console.log(JSON.stringify(finalIndexes, null, 2));

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
