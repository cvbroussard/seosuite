import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { commitCascade } from "@/lib/categorization/cascade-commit";
import type { CascadeAnalysis } from "@/lib/categorization/cascade-analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/assets/[id]/categorize/commit
 *
 * Commits a previously-generated cascade preview. The preview artifact
 * is sent in the body — server trusts it (auth-gated) and persists it
 * + runs all the heavy consumable-producing work:
 *   - asset_analysis JSONB write
 *   - asset_categories rows
 *   - asset_brands rows (from NER → catalog brand match)
 *   - R2 source rename (slug-derived)
 *   - Video poster rename (if applicable)
 *   - Variant cascade-delete + re-render with slug-derived keys
 *   - CDN purge
 *
 * Body:
 *   { analysis: CascadeAnalysis }
 *
 * Response:
 *   { ok: true, categoryRows, brandRows, suggestedNewBrandCount,
 *     slugApplied, renamed, variantCount, warnings }
 *
 * No LLM cost (LLM already ran in preview). R2 + variant render only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`SELECT id, site_id FROM media_assets WHERE id = ${assetId}`;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  let body: { analysis: CascadeAnalysis };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.analysis || !body.analysis.asset_categories?.primary?.gcid) {
    return NextResponse.json(
      { error: "Body must include analysis with asset_categories.primary" },
      { status: 400 },
    );
  }

  try {
    const result = await commitCascade({
      assetId,
      analysis: body.analysis,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`commitCascade endpoint failed for ${assetId}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
