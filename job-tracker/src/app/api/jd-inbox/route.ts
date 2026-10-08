import { NextResponse } from "next/server";
import { writeJdInboxFile } from "@/lib/jdInbox/jdInbox";

// POST /api/jd-inbox -- the Chrome extension's "Save JD for triage"
// button. Writes one markdown file into JD_INBOX_DIR for Claude to triage
// later. Deliberately no database or Notion writes.

const BOARDS = new Set(["linkedin", "indeed"]);

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  const dir = process.env.JD_INBOX_DIR?.trim();
  if (!dir) {
    return NextResponse.json(
      { ok: false, error: "JD_INBOX_DIR is not set in .env.local." },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const company = str(body.company);
  const title = str(body.title);
  const board = str(body.board).toLowerCase();
  // Description is kept as-is (only outer whitespace trimmed) so line
  // breaks survive into the file.
  const description = str(body.description);

  if (!company || !title || !description || !BOARDS.has(board)) {
    return NextResponse.json(
      {
        ok: false,
        error: "company, title, description and board (linkedin or indeed) are required.",
      },
      { status: 400 }
    );
  }

  try {
    const filename = await writeJdInboxFile(dir, {
      company,
      title,
      board,
      description,
      salary: str(body.salary) || undefined,
      url: str(body.url) || undefined,
    });
    return NextResponse.json({ ok: true, filename }, { status: 201 });
  } catch (error) {
    console.error("POST /api/jd-inbox failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to write the JD inbox file." },
      { status: 500 }
    );
  }
}
