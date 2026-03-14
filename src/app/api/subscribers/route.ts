import { sql } from "@/lib/db";
import { hashApiKey } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * POST /api/subscribers — Create a new subscriber + generate API key.
 * Internal/admin only (no auth gate yet — Phase 1 bootstrap).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, plan } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Generate a random API key
    const apiKey = `seo_${randomBytes(24).toString("hex")}`;
    const apiKeyHash = await hashApiKey(apiKey);

    const rows = await sql`
      INSERT INTO subscribers (name, api_key_hash, plan)
      VALUES (${name}, ${apiKeyHash}, ${plan || "free"})
      RETURNING id, name, plan, created_at
    `;

    return NextResponse.json({
      subscriber: rows[0],
      api_key: apiKey, // Only shown once at creation
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/subscribers — List all subscribers.
 * Internal/admin only.
 */
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, plan, is_active, created_at, updated_at
      FROM subscribers
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ subscribers: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
