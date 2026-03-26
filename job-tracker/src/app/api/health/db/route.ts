import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongoose";

export async function GET() {
  try {
    await connectToDatabase();

    return NextResponse.json({
      ok: true,
      message: "MongoDB connection successful",
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "MongoDB connection failed",
      },
      { status: 500 }
    );
  }
}