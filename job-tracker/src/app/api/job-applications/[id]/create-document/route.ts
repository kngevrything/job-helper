import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import path from "path";
import fs from "fs/promises";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { type } = await req.json();

    if (type !== "resume" && type !== "coverLetter") {
      return NextResponse.json(
        { ok: false, error: "type must be 'resume' or 'coverLetter'." },
        { status: 400 }
      );
    }

    const applicationsRoot = process.env.APPLICATIONS_ROOT;
    const baseResumeFilename = process.env.BASE_RESUME_FILENAME;
    const baseCoverLetterFilename = process.env.BASE_COVER_LETTER_FILENAME;

    if (!applicationsRoot || !baseResumeFilename || !baseCoverLetterFilename) {
      return NextResponse.json(
        { ok: false, error: "Missing file configuration in environment." },
        { status: 500 }
      );
    }

    await connectToDatabase();

    const app = await JobApplication.findById(id).lean();

    if (!app) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 }
      );
    }

    if (!app.folderPath) {
      return NextResponse.json(
        { ok: false, error: "Application has no folder path." },
        { status: 400 }
      );
    }

    const isResume = type === "resume";
    const baseFilename = isResume ? baseResumeFilename : baseCoverLetterFilename;
    const label = isResume ? "Resume" : "Cover Letter";
    const sourcePath = path.join(applicationsRoot, baseFilename);
    const destFilename = `Kevin Liedtke ${label} ${app.jobId}.docx`;
    const destPath = path.join(app.folderPath, destFilename);

    if (await fileExists(destPath)) {
      return NextResponse.json(
        { ok: false, error: "File already exists." },
        { status: 409 }
      );
    }

    await fs.copyFile(sourcePath, destPath);

    const field = isResume ? "resumePath" : "coverLetterPath";
    const updatePayload: Record<string, unknown> = { [field]: destPath };
    // Only advance a brand-new application into "Tailoring". Without this check,
    // (re)creating a resume for an application that already progressed further
    // (e.g. "2nd Round Scheduled") would silently regress its status back down.
    if (isResume && app.status === "UNSET") updatePayload.status = "Tailoring";

    const updated = await JobApplication.findByIdAndUpdate(
      id,
      updatePayload,
      { returnDocument: "after" }
    ).lean();

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("create-document failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create document." },
      { status: 500 }
    );
  }
}
