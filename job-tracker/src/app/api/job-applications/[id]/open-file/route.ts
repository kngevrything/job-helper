import { NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { ok: false, error: "filePath is required." },
        { status: 400 }
      );
    }

    exec(`start "" "${filePath}"`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("open-file failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to open file." },
      { status: 500 }
    );
  }
}
