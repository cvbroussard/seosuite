import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { renderAllVariantsForAsset } from "@/lib/pipeline/variant-render";

export const runtime = "nodejs";
// Pro plan max. Variants are sharp/ffmpeg CPU-bound; large videos with
// many platform variants can take a couple minutes. Commit is decoupled
// (own 60s budget) so this longer limit only affects background render.
export const maxDuration = 300;

/**
 * POST /api/assets/[id]/render-variants
 *
 * Renders all applicable platform variants for an asset. Decoupled from
 * the cascade commit endpoint so each gets its own 60s Vercel function
 * budget. Commit fires this fire-and-forget after the cascade artifact
 * lands; subscriber is released within ~1-2s, variants build in the
 * background.
 *
 * Side effects:
 *   - Reads source from media_assets.storage_url
 *   - Writes asset_variants rows + R2 objects with slug-derived keys
 *   - Updates media_assets.metadata.variants_pending / variants_rendered_at
 *
 * Cost: 0 LLM, CPU-bound (sharp + ffmpeg). ~5-30s depending on template
 * count + asset size.
 *
 * Idempotent: re-firing on an asset replaces variants. Safe to retry.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT id, site_id FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  try {
    const variantResults = await renderAllVariantsForAsset(assetId);
    await sql`
      UPDATE media_assets
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        variants_pending: false,
        variants_rendered_at: new Date().toISOString(),
        variant_count: variantResults.length,
      })}::jsonb,
      updated_at = NOW()
      WHERE id = ${assetId}
    `;
    return NextResponse.json({ ok: true, variantCount: variantResults.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`render-variants failed for ${assetId}:`, message);
    // Leave variants_pending=true so orchestrator pool query gates
    // correctly. Caller can re-fire this endpoint to retry.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
