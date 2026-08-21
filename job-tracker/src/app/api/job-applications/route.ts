import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication, DUPLICATE_MATCH_COLLATION } from "@/models/JobApplication";
import { jobApplicationInputSchema } from "@/lib/validation/jobApplication";
import { generateOutputs } from "@/lib/prompts/generateOutputs";
import { createApplicationFolder } from "@/lib/files/createApplicationFolder";

// The findOne-then-create below has a check-then-act race: two near-simultaneous
// requests can both pass the findOne check, and the second create() then trips
// the real unique index on {company, jobId} in MongoDB (error code 11000).
// Without this, that surfaces as a generic 500 instead of the same clean 409
// the pre-check already returns for the (much more common) non-race case.
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function GET() {
  try {
    await connectToDatabase();

    const applications = await JobApplication.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      ok: true,
      data: applications,
    });
  } catch (error) {
    console.error("GET /api/job-applications failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to load applications." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const parsed = jobApplicationInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const input = parsed.data;

    await connectToDatabase();

    // Same collation as the unique index itself (see JobApplication.ts)
    // so this pre-check never disagrees with what the index will
    // actually allow -- "SecurityScorecard" and "Securityscorecard"
    // count as the same company here, same as at the index level.
    const existing = await JobApplication.findOne({
      company: input.company,
      jobId: input.jobId,
    }).collation(DUPLICATE_MATCH_COLLATION);

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "Application already exists for this company and job ID.",
        },
        { status: 409 }
      );
    }

    const { excelRowText, starterPromptText } = generateOutputs(input);

    const applicationsRoot = process.env.APPLICATIONS_ROOT;

    if (!applicationsRoot) {
      return NextResponse.json(
        { ok: false, error: "Missing APPLICATIONS_ROOT in environment." },
        { status: 500 }
      );
    }

    const folderResult = await createApplicationFolder({
      applicationsRoot,
      company: input.company,
      jobId: input.jobId,
    });

    let created;
    try {
      created = await JobApplication.create({
        company: input.company,
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        jobUrl: input.jobUrl,
        folderPath: folderResult.folderPath,
        resumePath: null,
        coverLetterPath: null,
        excelRowText,
        starterPromptText,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Application already exists for this company and job ID.",
          },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      data: created,
    });
  } catch (error) {
    console.error("POST /api/job-applications failed:", error);

    return NextResponse.json(
      { ok: false, error: "Internal server error - " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
