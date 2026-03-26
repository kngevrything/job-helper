import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import { jobApplicationInputSchema } from "@/lib/validation/jobApplication";
import { generateOutputs } from "@/lib/prompts/generateOutputs";
import { companyNeedsCustomResume } from "@/lib/files/companyRules";
import { createApplicationFiles } from "@/lib/files/createApplicationFiles";

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

    // validate input
    const parsed = jobApplicationInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;

    await connectToDatabase();

    // duplicate check
    const existing = await JobApplication.findOne({
      company: input.company,
      jobId: input.jobId,
    });

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "Application already exists for this company and job ID.",
        },
        { status: 409 }
      );
    }

    // business rule
    const needsCustomResume = companyNeedsCustomResume(input.company);

    // generate outputs
    const { excelRowText, starterPromptText } = generateOutputs(input);

    const applicationsRoot = process.env.APPLICATIONS_ROOT;
    const baseResumeFilename = process.env.BASE_RESUME_FILENAME;
    const baseCoverLetterFilename = process.env.BASE_COVER_LETTER_FILENAME;

    if (!applicationsRoot || !baseResumeFilename || !baseCoverLetterFilename) {
      return NextResponse.json(
        { ok: false, error: "Missing file configuration in environment." },
        { status: 500 }
      );
    }

    const fileResult = await createApplicationFiles({
      applicationsRoot,
      baseResumeFilename,
      baseCoverLetterFilename,
      company: input.company,
      jobId: input.jobId,
      needsCustomResume,
      
    });

    const created = await JobApplication.create({
      company: input.company,
      jobId: input.jobId,
      jobTitle: input.jobTitle,
      jobUrl: input.jobUrl,
      needsCustomResume,
      folderPath: fileResult.folderPath,
      resumePath: fileResult.resumePath,
      coverLetterPath: fileResult.coverLetterPath,
      excelRowText,
      starterPromptText,
    });

    return NextResponse.json({
      ok: true,
      data: created,
    });
  } catch (error) {
    console.error("POST /api/job-applications failed:", error);

    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}