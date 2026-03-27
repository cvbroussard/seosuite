import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/pillar-config
 * Body: { siteId, config }
 *
 * Admin saves pillar+tag config for any site.
 * No subscriber auth check — admin cookie only.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, config } = body;

  if (!siteId || !config) {
    return NextResponse.json({ error: "siteId and config required" }, { status: 400 });
  }

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET pillar_config = ${JSON.stringify(config)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ ok: true });
}
