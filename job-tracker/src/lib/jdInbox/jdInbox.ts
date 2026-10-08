import path from "path";
import fs from "fs/promises";

// "Save JD for triage" inbox. The Chrome extension posts a scraped job
// description here and this writes it as a markdown file into a folder
// Claude reads later for fit triage. No database or Notion writes, no
// duplicate detection, and nothing here ever edits or deletes an
// existing file (Claude deletes them after processing).

export type JdInboxInput = {
  company: string;
  title: string;
  board: string;
  description: string;
  salary?: string;
  url?: string;
};

const MAX_FILENAME_LENGTH = 100;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Local time on purpose: the files are read on this same machine, so the
// timestamp should match the clock the user sees.
export function formatTimestamp(date: Date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// {yyyyMMdd-HHmmss}_{company}_{title}.md, at most 100 characters
// including any "-N" collision suffix. The timestamp always comes first,
// so the name can never start with an underscore (Claude skips those).
export function buildBaseName(input: Pick<JdInboxInput, "company" | "title">, now: Date) {
  const stamp = formatTimestamp(now);
  // Room for "_", "_", ".md" and a worst-case "-99" suffix.
  const budget = MAX_FILENAME_LENGTH - stamp.length - 2 - 3 - 3;
  let company = slugify(input.company) || "unknown-company";
  let title = slugify(input.title) || "unknown-title";

  if (company.length + title.length > budget) {
    // Keep at least some of each; trim the longer one first.
    company = company.slice(0, Math.max(20, budget - title.length)).replace(/-+$/, "");
    title = title.slice(0, budget - company.length).replace(/-+$/, "");
  }
  return `${stamp}_${company}_${title}`;
}

// Pull a pay range (or a single amount with a pay period) out of the
// description text. Returned as it appears in the posting, whitespace
// collapsed. Ranges win over single amounts; a bare dollar figure with no
// period ("$5M in funding") is ignored.
const AMOUNT = String.raw`\$\s?\d[\d,]*(?:\.\d+)?[kK]?`;
const PERIOD = String.raw`(?:\s*(?:USD|CAD))?(?:\s*(?:\/|per\s+|an\s+|a\s+)\s*(?:year|yr|annum|hour|hr)\b|\s+annually\b|\s+hourly\b)?`;
const RANGE_RE = new RegExp(
  `${AMOUNT}(?:\\s*(?:USD|CAD))?\\s*(?:-|\\u2013|\\u2014|to)\\s*\\$?\\s?\\d[\\d,]*(?:\\.\\d+)?[kK]?(?![\\d,])${PERIOD}`,
  "i"
);
const SINGLE_RE = new RegExp(
  `${AMOUNT}(?:\\s*(?:USD|CAD))?(?:\\s*(?:\\/|per\\s+|an\\s+|a\\s+)\\s*(?:year|yr|annum|hour|hr)\\b|\\s+annually\\b|\\s+hourly\\b)`,
  "i"
);

export function parseSalary(description: string): string | null {
  const match = description.match(RANGE_RE) || description.match(SINGLE_RE);
  return match ? match[0].replace(/\s+/g, " ").trim().replace(/,$/, "") : null;
}

function headerValue(value: string) {
  // Header lines are "key: value" -- keep each value on one line.
  return value.replace(/\s+/g, " ").trim();
}

export function buildContent(input: JdInboxInput) {
  const salary = input.salary?.trim() || parseSalary(input.description) || "unknown";
  const lines = [
    `company: ${headerValue(input.company)}`,
    `title: ${headerValue(input.title)}`,
    `board: ${headerValue(input.board)}`,
    `salary: ${headerValue(salary)}`,
  ];
  if (input.url?.trim()) lines.push(`url: ${headerValue(input.url)}`);
  lines.push("---", input.description);
  return lines.join("\n") + "\n";
}

// Writes the file without ever overwriting: "wx" fails if the name is
// taken, and we retry with -2, -3, ... Returns the filename written.
export async function writeJdInboxFile(dir: string, input: JdInboxInput, now = new Date()) {
  await fs.mkdir(dir, { recursive: true });
  const base = buildBaseName(input, now);
  const content = buildContent(input);

  for (let n = 1; n < 100; n++) {
    const filename = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    try {
      await fs.writeFile(path.join(dir, filename), content, { encoding: "utf8", flag: "wx" });
      return filename;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error("Too many files with the same name in the JD inbox.");
}
