// Helpers for the "might I have already applied to this?" check
// (GET /api/job-applications/check).
//
// Job boards (LinkedIn, Indeed, ...) carry their own posting IDs, never
// the company's ATS requisition ID, so a company+jobId match can't fire
// for a board posting. For those the useful signal is company + title.
//
// ATS hosts (Greenhouse, Lever, Ashby, Workday, iCIMS, ...) are NOT
// boards -- that's where applications actually happen, and their jobId
// is the real requisition ID. Keep them out of this list.
export const JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "dice.com",
  "wellfound.com",
  "builtin.com",
  "simplyhired.com",
  "monster.com",
  "welcometothejungle.com",
] as const;

export function isJobBoardUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return JOB_BOARD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Whole-word abbreviations expanded before comparison.
const TITLE_ABBREVIATIONS: Record<string, string> = {
  sr: "senior",
  jr: "junior",
  sw: "software",
  mgr: "manager",
};

// Normalizes formatting only, never meaning: case, punctuation,
// separators and a few abbreviations. Team/area suffixes are kept, since
// "Software Engineer - Payments" vs "Software Engineer - Identity" is the
// distinction that matters. Comma, dash, en/em dash, pipe, colon and
// slash separators all collapse to a space, so
// "Sr. Software Engineer, Payments" and "Senior Software Engineer - Payments"
// compare equal.
export function normalizeJobTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => TITLE_ABBREVIATIONS[w] ?? w)
    .join(" ");
}

export function jobTitlesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeJobTitle(a);
  return na !== "" && na === normalizeJobTitle(b);
}
