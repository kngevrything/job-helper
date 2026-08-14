import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import { z } from "zod";

const updateSchema = z.object({
  jobTitle: z.string().trim().min(1),
  jobUrl: z.string().trim().url(),
  notes: z.string(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const updated = await JobApplication.findByIdAndUpdate(
      id,
      {
        jobTitle: parsed.data.jobTitle,
        jobUrl: parsed.data.jobUrl,
        notes: parsed.data.notes,
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("PATCH /api/job-applications/[id] failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to update application." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    await connectToDatabase();

    const deleted = await JobApplication.findByIdAndDelete(id).lean();

    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/job-applications/[id] failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to remove application." },
      { status: 500 }
    );
  }
}