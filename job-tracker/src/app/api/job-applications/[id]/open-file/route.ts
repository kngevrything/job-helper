import { NextResponse } from "next/server";
import { execFile } from "child_process";

export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { ok: false, error: "filePath is required." },
        { status: 400 }
      );
    }

    // execFile with an argument array never invokes a shell, so filePath can't
    // break out into additional commands the way it could with
    // exec(`start "" "${filePath}"`) (command injection). "start" is a cmd.exe
    // builtin rather than its own executable, so cmd.exe still has to run it --
    // but filePath is passed as one literal argv element, not shell-parsed text.
    execFile("cmd.exe", ["/c", "start", "", filePath]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("open-file failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to open file." },
      { status: 500 }
    );
  }
}
