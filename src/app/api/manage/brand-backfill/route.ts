import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enrichBrand } from "@/lib/brand-enrich";

/**
 * POST /api/manage/brand-backfill
 * Body (all optional): { site_id?, limit?, dry_run? }
 *
 * Runs Stage 1+2+3 enrichment over every brand row where
 * `enriched_at IS NULL` AND `enrichment_status NOT IN ('skipped')`.
 *
 * Sequential to keep Sonnet + outbound HTTP polite. Idempotent — the
 * gate inside enrichBrand() short-circuits anything already enriched,
 * so re-running is safe.
 *
 * One-time operator tool for backfilling pre-#214 brand rows. Forward
 * brand creation enriches inline via /api/brands POST.
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const siteId = typeof body.site_id === "string" ? body.site_id : null;
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(500, body.limit)) : 100;
  const dryRun = body.dry_run === true;

  const rows = siteId
    ? await sql`
        SELECT id, name FROM brands
        WHERE enriched_at IS NULL
          AND (enrichment_status IS NULL OR enrichment_status NOT IN ('skipped'))
          AND site_id = ${siteId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, name FROM brands
        WHERE enriched_at IS NULL
          AND (enrichment_status IS NULL OR enrichment_status NOT IN ('skipped'))
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
      await enrichBrand(id, name);
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
