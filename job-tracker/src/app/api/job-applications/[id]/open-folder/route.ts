import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { JobApplication } from "@/models/JobApplication";
import { execFile } from "child_process";

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