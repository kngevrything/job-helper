import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication, DUPLICATE_MATCH_COLLATION } from "@/models/JobApplication";

// Read-only sibling to the duplicate check already inside POST
// /api/job-applications (findOne on { company, jobId }, backed by the
// unique index on JobApplicationSchema). That check only runs once you
// submit -- this one lets a caller ask "have I already seen this?"
// *before* investing effort filling out a form, e.g. the Chrome
// extension calling this right after it scrapes a job posting.
//
// This is explicitly NOT a replacement for the POST route's dupe check.
// There's still a check-then-act gap between this GET and a later POST
// (e.g. the same job open in two tabs, or the Next.js app itself, at
// the same time) -- the POST route's findOne-then-create plus the real
// unique-index error (code 11000) stays the authoritative backstop.
// This is an early warning for the caller's UI, not a lock.
//
// Same match semantics as the POST pre-check: case-INsensitive on both
// fields (DUPLICATE_MATCH_COLLATION, same collation the unique index
// itself uses -- see JobApplication.ts), so "is this a duplicate" never
// disagrees between the two endpoints or with what the index actually
// enforces. "SecurityScorecard" and "Securityscorecard" -- e.g. from
// the Chrome extension's Greenhouse URL-slug-guess fallback vs. its
// title-parsed company name -- count as the same company here.
//
// Response is intentionally a trimmed subset, not the full document --
// the only known consumer (the extension's capture flow) needs enough
// to show "already applied -- STATUS, applied <date>", nothing else
// (folderPath/resumePath/coverLetterPath/excelRowText/starterPromptText
// are irrelevant to that and would just be discarded by the client).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company = searchParams.get("company")?.trim();
    const jobId = searchParams.get("jobId")?.trim();

    if (!company || !jobId) {
      return NextResponse.json(
        { ok: false, error: "company and jobId query params are both required." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existing = await JobApplication.findOne(
      { company, jobId },
      { status: 1, createdAt: 1, endedAt: 1 }
    )
      .collation(DUPLICATE_MATCH_COLLATION)
      .lean();

    return NextResponse.json({
      ok: true,
      exists: Boolean(existing),
      data: existing
        ? {
            status: existing.status,
            createdAt: existing.createdAt,
            endedAt: existing.endedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/job-applications/check failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to check for a duplicate application." },
      { status: 500 }
    );
  }
}
