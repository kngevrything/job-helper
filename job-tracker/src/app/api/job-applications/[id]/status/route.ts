import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import { jobApplicationStatusSchema } from "@/lib/validation/jobApplication";

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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const parsed = jobApplicationStatusSchema.safeParse(body.status);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid status." },
        { status: 400 }
      );
    }

    const status = parsed.data;
    const isTerminal = TERMINAL_STATUSES.has(status);

    await connectToDatabase();

    const updated = await JobApplication.findByIdAndUpdate(
      id,
      {
        status,
        endedAt: isTerminal ? new Date() : null,
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: updated,
    });
  } catch (error) {
    console.error("PATCH /api/job-applications/[id]/status failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to update status." },
      { status: 500 }
    );
  }
}