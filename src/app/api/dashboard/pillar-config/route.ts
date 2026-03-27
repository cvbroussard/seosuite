import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/dashboard/pillar-config
 * Body: { siteId, config }
 *
 * Save the two-tier pillar+tag configuration for a site.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { siteId, config } = body;

  if (!siteId || !config) {
    return NextResponse.json({ error: "siteId and config required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${session.subscriberId}
  `;

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
