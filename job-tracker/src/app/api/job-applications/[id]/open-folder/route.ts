import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import { execFile } from "child_process";

// REVERTED (see TESTING_REPORT.md): a client-side "copy folder path" version
// of this was tried alongside the open-file revert, for consistency, and
// rolled back for the same reason -- see open-file/route.ts.

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    await connectToDatabase();

    const app = await JobApplication.findById(id).lean();

    if (!app || !app.folderPath) {
      return NextResponse.json(
        { ok: false, error: "Folder not found." },
        { status: 404 }
      );
    }

    const folderPath = app.folderPath;

    // See open-file/route.ts for why execFile + an argument array (not exec with
    // a template string) is required here to avoid command injection.
    execFile("explorer.exe", [folderPath]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("open-folder failed:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to open folder." },
      { status: 500 }
    );
  }
}
