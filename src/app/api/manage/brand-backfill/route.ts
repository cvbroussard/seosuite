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

  type Result = {
    name: string;
    status: string;
    url: string | null;
    description: string | null;
    hero_url: string | null;
    og_image_url: string | null;
    hero_source: string | null;
    id: string;
    error?: string;
  };
  const results: Result[] = [];
  let enriched = 0;
  let noMatch = 0;
  let failed = 0;

  for (const row of rows) {
    const id = row.id as string;
    const name = row.name as string;
    try {
      await enrichBrand(id, name, { force: true });
      const [after] = await sql`
        SELECT b.enrichment_status, b.url, b.description,
               b.enrichment_metadata->>'og_image_url' AS og_image_url,
               b.enrichment_metadata->>'hero_source' AS hero_source,
               ma.storage_url AS hero_url
        FROM brands b
        LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
        WHERE b.id = ${id}
      `;
      const status = (after?.enrichment_status as string) || "unknown";
      results.push({
        name,
        status,
        url: (after?.url as string | null) || null,
        description: (after?.description as string | null) || null,
        hero_url: (after?.hero_url as string | null) || null,
        og_image_url: (after?.og_image_url as string | null) || null,
        hero_source: (after?.hero_source as string | null) || null,
        id,
      });
      if (status === "enriched") enriched++;
      else if (status === "no_match") noMatch++;
      else if (status === "failed") failed++;
    } catch (err) {
      failed++;
      results.push({
        name,
        status: "failed",
        url: null,
        description: null,
        hero_url: null,
        og_image_url: null,
        hero_source: null,
        id,
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
