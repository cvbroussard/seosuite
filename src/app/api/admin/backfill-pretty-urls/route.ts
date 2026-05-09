/**
 * POST /api/admin/backfill-pretty-urls
 *
 * One-shot migration endpoint for the URL-naming architecture (LOCKED 2026-05-08).
 * Iterates assets that already have triage results but no `url_slug_applied_at`
 * marker and runs `processBriefedAsset` on each — this re-triages with the
 * updated prompt (now returns `url_slug`), renames source bytes via R2
 * server-side copy, cascade-deletes legacy variants, and re-renders fresh
 * variants with slug-derived keys.
 *
 * Body: { site_id?: string, limit?: number, dry_run?: boolean }
 *  - site_id: scope to one site (optional — omit to backfill all sites)
 *  - limit: batch size (default 25, max 100 — Vercel function timeout)
 *  - dry_run: list candidates without running the orchestrator
 *
 * Skips: pending_briefing (no context yet), already-applied (url_slug_applied_at
 * present), archived (don't burn budget on archived assets).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { processBriefedAsset } from "@/lib/pipeline/process-briefed-asset";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const siteId = body.site_id as string | undefined;
  const dryRun = body.dry_run === true;
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? 25), 10) || 25, 1), 100);

  const candidates = siteId
    ? await sql`
        SELECT id, site_id, storage_url, media_type, triage_status
        FROM media_assets
        WHERE site_id = ${siteId}
          AND triage_status NOT IN ('pending_briefing')
          AND archived_at IS NULL
          AND (metadata->>'url_slug_applied_at') IS NULL
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, site_id, storage_url, media_type, triage_status
        FROM media_assets
        WHERE triage_status NOT IN ('pending_briefing')
          AND archived_at IS NULL
          AND (metadata->>'url_slug_applied_at') IS NULL
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      candidate_count: candidates.length,
      candidates: candidates.map((c) => ({
        id: c.id,
        site_id: c.site_id,
        media_type: c.media_type,
        triage_status: c.triage_status,
      })),
    });
  }

  const results: Array<{
    asset_id: string;
    ok: boolean;
    slug: string | null;
    renamed: boolean;
    variant_count: number;
    error?: string;
  }> = [];

  for (const asset of candidates) {
    const assetId = asset.id as string;
    try {
      const r = await processBriefedAsset(assetId);
      results.push({
        asset_id: assetId,
        ok: r.ok,
        slug: r.slug,
        renamed: r.renamed,
        variant_count: r.variantCount,
      });
    } catch (err) {
      results.push({
        asset_id: assetId,
        ok: false,
        slug: null,
        renamed: false,
        variant_count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    renamed: results.filter((r) => r.renamed).length,
    total_variants: results.reduce((sum, r) => sum + r.variant_count, 0),
  };

  return NextResponse.json({ summary, results });
}
