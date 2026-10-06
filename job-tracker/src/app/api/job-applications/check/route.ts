import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication, DUPLICATE_MATCH_COLLATION } from "@/models/JobApplication";
import { isJobBoardUrl, jobTitlesMatch } from "@/lib/jobMatching";

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
// "Possibly already applied" (optional jobTitle / jobUrl params):
// Board postings (LinkedIn, Indeed, ...) carry the board's ID, not the
// company's requisition ID, so company+jobId can't match them. When
// jobUrl is a job board and jobTitle is passed, this also returns every
// application at the same
// company (same case-insensitive collation) whose title matches after
// normalizeJobTitle (case, punctuation, separators, Sr/Jr/SW/Mgr) --
// team suffixes and levels stay significant. This is a heads-up, not a
// duplicate verdict, so it never affects `exists`. Only runs for board
// URLs: on a company careers page the jobId IS the company's ID, so the
// exact match above is the right check and a title match is just noise
// (e.g. a company with many same-titled reqs).
//
// Backward compatible: company + jobId alone behaves exactly as before
// (plus isJobBoard: false and possibleMatches: []).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company = searchParams.get("company")?.trim();
    const jobId = searchParams.get("jobId")?.trim();
    const jobTitle = searchParams.get("jobTitle")?.trim();
    const jobUrl = searchParams.get("jobUrl")?.trim();

    if (!company || (!jobId && !jobTitle)) {
      return NextResponse.json(
        { ok: false, error: "company and at least one of jobId or jobTitle query params are required." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existing = jobId
      ? await JobApplication.findOne(
          { company, jobId },
          { status: 1, createdAt: 1, endedAt: 1 }
        )
          .collation(DUPLICATE_MATCH_COLLATION)
          .lean()
      : null;

    const isJobBoard = isJobBoardUrl(jobUrl);

    let possibleMatches: Array<{
      _id: string;
      jobId: string;
      jobTitle: string;
      jobUrl: string;
      status: string;
      createdAt: Date;
    }> = [];

    if (jobTitle && isJobBoard) {
      const sameCompany = await JobApplication.find(
        { company },
        { jobId: 1, jobTitle: 1, jobUrl: 1, status: 1, createdAt: 1 }
      )
        .collation(DUPLICATE_MATCH_COLLATION)
        .sort({ createdAt: -1 })
        .lean();

      possibleMatches = sameCompany
        .filter(
          (app) =>
            jobTitlesMatch(app.jobTitle, jobTitle) &&
            (!existing || String(app._id) !== String(existing._id))
        )
        .map((app) => ({
          _id: String(app._id),
          jobId: app.jobId,
          jobTitle: app.jobTitle,
          jobUrl: app.jobUrl,
          status: app.status,
          createdAt: app.createdAt,
        }));
    }

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
      isJobBoard,
      possibleMatches,
    });
  } catch (error) {
    console.error("GET /api/job-applications/check failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to check for a duplicate application." },
      { status: 500 }
    );
  }
}
