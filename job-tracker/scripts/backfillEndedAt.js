const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
require("dotenv").config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env.local");
}

const TERMINAL_STATUSES = new Set([
  "Rejected, No Interview",
  "Closed, No Interview",
  "1st Round Exit",
  "2nd Round Exit",
  "3rd Round Exit",
  "Final Round Exit",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",
  "Made 2nd, Declined to Proceed",
]);

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(raw) {
  const value = normalize(raw);
  if (!value) return "";

  const lower = value.toLowerCase();

  const map = {
    "applied": "Applied",
    "1st interview done": "1st Interview Done",
    "1st round exit": "1st Round Exit",
    "final round scheduled": "Final Round Scheduled",
    "2nd round exit": "2nd Round Exit",
    "3rd round exit": "3rd Round Exit",
    "final round exit": "Final Round Exit",
    "made 2nd, declined to proceed": "Made 2nd, Declined to Proceed",
    "rejected, no interview": "Rejected, No Interview",
    "closed, no interview": "Closed, No Interview",
    "no response, job closed": "No Response, Job Closed",
    "ghosted": "Ghosted",
    "disappeared": "Disappeared",
    "disappered": "Disappeared",
  };

  return map[lower] || value;
}

function parseDateApplied(raw) {
  const value = normalize(raw);
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Date Applied: ${raw}`);
  }

  return parsed;
}

function parseHistoricalDays(raw) {
  const value = normalize(raw);

  if (!value) return { kind: "none" };
  if (value === "-") return { kind: "none" };
  if (value.toLowerCase().startsWith("ignore")) return { kind: "ignore" };

  const days = Number(value);

  if (Number.isNaN(days)) {
    return { kind: "none" };
  }

  return { kind: "number", days };
}

const jobApplicationSchema = new mongoose.Schema(
  {
    company: String,
    jobId: String,
    status: String,
    createdAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

const JobApplication =
  mongoose.models.JobApplication ||
  mongoose.model("JobApplication", jobApplicationSchema);

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "jobtracker" });

  const csvPath = path.join(process.cwd(), "import.csv");
  const csvText = fs.readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, "");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const company = normalize(row["Company"]);
      const jobId = normalize(row["Job ID"]);
      const rawDateApplied = normalize(row["Date Applied"]);
      const status = normalizeStatus(row["Status"]);
      const parsedDays = parseHistoricalDays(row["Days Since Applied"]);

      if (!company && !jobId && !rawDateApplied) {
        skipped++;
        continue;
      }

      if (!company || !jobId) {
        skipped++;
        continue;
      }

      if (!rawDateApplied) {
        console.warn(
          `Skipping row with missing Date Applied for Company="${company}" Job ID="${jobId}"`
        );
        skipped++;
        continue;
      }

      const dateApplied = parseDateApplied(rawDateApplied);

      const doc = await JobApplication.findOne({ company, jobId });

      if (!doc) {
        notFound++;
        continue;
      }

      if (!TERMINAL_STATUSES.has(status)) {
        if (doc.endedAt !== null) {
          doc.endedAt = null;
          await doc.save();
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      if (parsedDays.kind !== "number") {
        if (doc.endedAt !== null) {
          doc.endedAt = null;
          await doc.save();
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      const endedAt = new Date(dateApplied);
      endedAt.setDate(endedAt.getDate() + parsedDays.days);

      doc.endedAt = endedAt;
      await doc.save();
      updated++;
    } catch (error) {
      errors++;
      console.error(
        `Backfill failed for Company="${row["Company"]}" Job ID="${row["Job ID"]}"`
      );
      console.error(error.message || error);
    }
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});