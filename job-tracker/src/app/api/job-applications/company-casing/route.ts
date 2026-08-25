import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication, DUPLICATE_MATCH_COLLATION } from "@/models/JobApplication";

// Read-only lookup: given a company name (often a URL-slug/subdomain
// guess from the Chrome extension's scrapers -- e.g. "1password" from
// jobs.ashbyhq.com/1password/..., or "securityscorecard" from a
// Greenhouse board URL), return the casing already stored in the DB for
// that company, if any. The extension uses this to correct a guessed
// casing against what you've actually applied under before, instead of
// letting the same company accumulate multiple casings across records
// ("1password" vs "1Password") that read as different companies
// anywhere casing isn't collation-normalized (e.g. a plain-text search
// or export).
//
// Case-insensitive match via the same DUPLICATE_MATCH_COLLATION the
// unique index and check/route.ts use, so "is this the same company"
// never disagrees between endpoints or with what the index enforces.
// Returns the casing from the most recently created matching
// application (most likely to reflect how you currently write the
// name), or null if you've never applied there.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company = searchParams.get("company")?.trim();

    if (!company) {
      return NextResponse.json(
        { ok: false, error: "company query param is required." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existing = await JobApplication.findOne(
      { company },
      { company: 1 }
    )
      .collation(DUPLICATE_MATCH_COLLATION)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      ok: true,
      company: existing ? existing.company : null,
    });
  } catch (error) {
    console.error("GET /api/job-applications/company-casing failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to look up stored company casing." },
      { status: 500 }
    );
  }
}
