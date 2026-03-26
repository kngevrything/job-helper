const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
require("dotenv").config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env.local");
}

const JOB_APPLICATION_STATUSES = [
  "Applied",
  "1st Interview Done",
  "1st Round Exit",
  "Final Round Scheduled",
  "2nd Round Exit",
  "3rd Round Exit",
  "Final Round Exit",
  "Made 2nd, Declined to Proceed",
  "Rejected, No Interview",
  "Closed, No Interview",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",
];

const VALID_STATUSES = new Set(JOB_APPLICATION_STATUSES);

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(raw) {
  const value = normalize(raw);

  if (!value) return "Applied";

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

  const mapped = map[lower] || value;

  if (!VALID_STATUSES.has(mapped)) {
    console.warn(`Unknown status "${raw}", defaulting to Applied`);
    return "Applied";
  }

  return mapped;
}

function parseExcelDate(raw) {
  const value = normalize(raw);

  if (!value) {
    throw new Error("Missing Date Applied");
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Date Applied: ${raw}`);
  }

  return parsed;
}

function formatDateForExcel(date) {
  return date.toISOString().split("T")[0];
}

function generateExcelRowText(input) {
  return [
    formatDateForExcel(input.createdAt),
    input.company,
    input.jobId,
    input.jobTitle,
    input.jobUrl,
  ].join("\t");
}

function generateStarterPromptText(input) {
  return (
    `Start a new job tailoring session for ${input.company} - ${input.jobTitle}. ` +
    `Use tailoring_context.md to determine which files are authoritative. ` +
    `My next message will contain the job description.`
  );
}

function companyNeedsCustomResume(company) {
  const excluded = new Set(["microsoft", "github", "atlassian"]);
  return !excluded.has(company.trim().toLowerCase());
}

const jobApplicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, trim: true },
    jobId: { type: String, required: true, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    jobUrl: { type: String, required: true, trim: true },
    status: { type: String, required: true, default: "Applied" },
    notes: { type: String, default: "" },
    needsCustomResume: { type: Boolean, required: true },
    folderPath: { type: String, default: null },
    resumePath: { type: String, default: null },
    coverLetterPath: { type: String, default: null },
    excelRowText: { type: String, required: true },
    starterPromptText: { type: String, required: true },
  },
  { timestamps: true }
);

jobApplicationSchema.index({ company: 1, jobId: 1 }, { unique: true });

const JobApplication =
  mongoose.models.JobApplication ||
  mongoose.model("JobApplication", jobApplicationSchema);

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "jobtracker" });

  const csvPath = path.join(process.cwd(), "import.csv");
  const csvText = fs.readFileSync(csvPath, "utf-8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  });

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const company = normalize(row["Company"]);
      const jobId = normalize(row["Job ID"]);
      const jobTitle = normalize(row["Title"]);
      const jobUrl = normalize(row["Link"]);
      const notes = normalize(row["Notes"]);
      const status = normalizeStatus(row["Status"]);
      const createdAt = parseExcelDate(row["Date Applied"]);

      if (!company || !jobId || !jobTitle || !jobUrl) {
        throw new Error(
          `Missing required fields. Company="${company}", Job ID="${jobId}", Title="${jobTitle}", Link="${jobUrl}"`
        );
      }

      const existing = await JobApplication.findOne({ company, jobId }).lean();

      if (existing) {
        skipped++;
        continue;
      }

      const days = Number(row["Days Since Applied"]);

      if (!Number.isNaN(days)) {
        const endedAt = new Date(createdAt);
        endedAt.setDate(endedAt.getDate() + days);
      }

      await JobApplication.create({
        company,
        jobId,
        jobTitle,
        jobUrl,
        status,
        notes,
        needsCustomResume: companyNeedsCustomResume(company),
        folderPath: null,
        resumePath: null,
        coverLetterPath: null,
        excelRowText: generateExcelRowText({
          createdAt,
          company,
          jobId,
          jobTitle,
          jobUrl,
        }),
        starterPromptText: generateStarterPromptText({
          company,
          jobTitle,
        }),
        createdAt,
        updatedAt: createdAt,
        endedAt: null,
      });

      inserted++;
    } catch (error) {
      errors++;
      console.error(
        `Row import failed for Company="${row["Company"]}" Job ID="${row["Job ID"]}" Title="${row["Title"]}"`
      );
      console.error(error.message || error);
    }
  }

  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped duplicates: ${skipped}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});