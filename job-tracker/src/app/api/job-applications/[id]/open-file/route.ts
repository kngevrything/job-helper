import { NextResponse } from "next/server";
import { execFile } from "child_process";

// REVERTED (see TESTING_REPORT.md): a container-portable HTTP-download
// version of this route was tried and rolled back. Downloading always
// creates a second copy of the file in the browser's Downloads folder,
// which breaks the actual workflow this app is built around -- open the
// resume in Word, edit it, save it in place, back into the tracked
// application folder. Shell-exec on the server's own machine is the only
// way to preserve "edit in place," so this only works when the server and
// the desktop opening the file are the same computer (not in a Linux
// container). Deliberate, accepted tradeoff.
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
