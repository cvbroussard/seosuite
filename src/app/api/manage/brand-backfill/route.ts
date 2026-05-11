import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enrichBrand } from "@/lib/brand-enrich";

/**
 * POST /api/manage/brand-backfill
 * Body (all optional): { limit?, dry_run? }
 *
 * Force-enriches every brand row, regardless of current state.
 * enrichBrand is called with `force: true`, which bypasses the
 * idempotency gates (enriched_at, skipped status, existing url) and
 * uses COALESCE on the way out — so existing user-set values are
 * preserved, only gaps get filled.
 *
 * Sequential to keep Sonnet + outbound HTTP polite. Safe to re-run.
 *
 * One-time operator tool for sweeping pre-#214 brand rows. Forward
 * brand creation enriches inline via /api/brands POST; everything
 * else is manual.
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(1000, body.limit)) : 500;
  const dryRun = body.dry_run === true;

  const rows = await sql`
    SELECT id, name FROM brands
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      candidate_count: rows.length,
      candidates: rows.map((r) => ({ id: r.id, name: r.name })),
    });
  }

  const results: Array<{ id: string; name: string; status: string; error?: string }> = [];
  let enriched = 0;
  let noMatch = 0;
  let failed = 0;

  for (const row of rows) {
    const id = row.id as string;
    const name = row.name as string;
    try {
      await enrichBrand(id, name, { force: true });
      const [after] = await sql`SELECT enrichment_status FROM brands WHERE id = ${id}`;
      const status = (after?.enrichment_status as string) || "unknown";
      results.push({ id, name, status });
      if (status === "enriched") enriched++;
      else if (status === "no_match") noMatch++;
      else if (status === "failed") failed++;
    } catch (err) {
      failed++;
      results.push({
        id,
        name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: rows.length,
    enriched,
    no_match: noMatch,
    failed,
    results,
  });
}
