import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch {
    return NextResponse.json(
      { status: "error", db: "disconnected" },
      { status: 503 }
    );
  }
}
