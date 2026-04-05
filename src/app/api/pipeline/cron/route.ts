import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { triageAsset } from "@/lib/pipeline/triage";
import { runAllPipelines } from "@/lib/pipeline/orchestrator";
import { refreshExpiringTokens } from "@/lib/pipeline/token-refresh";

export const maxDuration = 300;

/**
 * GET /api/pipeline/cron — Runs every 15 minutes (Vercel cron).
 *
 * 1. Retries stuck triage (assets at "received" older than 5 minutes)
 * 2. Refreshes expiring social tokens
 * 3. Runs autopilot pipelines for all enabled sites
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Retry stuck triage ──
    // Assets stuck at "received" for 5+ minutes — triage failed or was rate-limited.
    // Process up to 20 per run to stay within timeout.
    const stuck = await sql`
      SELECT id FROM media_assets
      WHERE triage_status = 'received'
        AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at ASC
      LIMIT 20
    `;

    let triageRetried = 0;
    let triageErrors = 0;
    for (const asset of stuck) {
      try {
        await triageAsset(asset.id as string);
        triageRetried++;
      } catch (err) {
        triageErrors++;
        console.error(`Triage retry failed for ${asset.id}:`, err instanceof Error ? err.message : err);
      }
      // Small delay to avoid rate limiting
      if (stuck.length > 5) await new Promise((r) => setTimeout(r, 500));
    }

    // ── 2. Refresh expiring tokens ──
    const tokenResult = await refreshExpiringTokens();

    // ── 3. Run all pipelines ──
    const results = await runAllPipelines();

    const summary = {
      triage_retried: triageRetried,
      triage_errors: triageErrors,
      triage_remaining: stuck.length === 20 ? "20+" : 0,
      sites_processed: results.length,
      total_triaged: results.reduce((n, r) => n + r.assetsTriaged, 0),
      total_slots_generated: results.reduce((n, r) => n + r.slotsGenerated, 0),
      total_slots_filled: results.reduce((n, r) => n + r.slotsFilled, 0),
      total_captions: results.reduce((n, r) => n + r.captionsGenerated, 0),
      total_published: results.reduce((n, r) => n + r.postsPublished, 0),
      total_failed: results.reduce((n, r) => n + r.postsFailed, 0),
      tokens_refreshed: tokenResult.refreshed,
      tokens_failed: tokenResult.failed,
      errors: results.flatMap((r) => r.errors),
    };

    return NextResponse.json({ summary, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
