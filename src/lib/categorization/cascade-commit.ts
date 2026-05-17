/**
 * Cascade commit orchestrator — the post-briefing event.
 *
 * Per the consumption-gated architecture (project_tracpost_asset_analysis
 * _cascade memory):
 *
 *   "Consumption is the gate. Nothing can consume an unbriefed asset.
 *    All consumable work fires at cascade commit, not save."
 *
 * This is the ONE place where everything consumable gets produced:
 *   1. Persist asset_analysis JSONB + asset_categories rows
 *   2. Brand match (NER → catalog) + asset_brands rows
 *   3. Derive slug from cascade output
 *   4. Rename source R2 key to slug-derived (if differs)
 *   5. Rename video poster (if asset has one)
 *   6. Cascade-delete existing variants + their R2 objects
 *   7. Render all variants with slug-derived keys
 *   8. Purge CDN cache for old URLs
 *
 * Fires from POST /api/assets/[id]/categorize/commit when subscriber/
 * operator confirms a cascade preview. Idempotent: re-firing with the
 * same slug is a no-op for R2 ops; re-firing with a different slug
 * re-renames everything.
 *
 * Cost beyond the LLM calls (which already happened in preview):
 *   - R2 copy + delete (~$0.0001 per rename)
 *   - Variant render: sharp/ffmpeg CPU time, ~5-10s total
 *   - CDN purge: free (Cloudflare API)
 */
import "server-only";
import { sql } from "@/lib/db";
import { renameR2Object, keyFromStorageUrl, R2_PUBLIC_DOMAIN, deleteObjectFromR2 } from "@/lib/r2";
import { deriveSourceKey } from "@/lib/pipeline/asset-keys";
import { renderAllVariantsForAsset } from "@/lib/pipeline/variant-render";
import { purgeCdnCache } from "@/lib/cdn";
import { matchBrandsFromNer } from "./brand-match";
import type { CascadeAnalysis } from "./cascade-analyze";

export interface CommitCascadeInput {
  assetId: string;
  analysis: CascadeAnalysis;
}

export interface CommitCascadeResult {
  ok: boolean;
  categoryRows: number;
  /** Catalog brands linked from NER hits. */
  brandRows: number;
  /** NER brand candidates that didn't match the catalog — caller can
   * surface for promote-to-catalog. */
  suggestedNewBrandCount: number;
  slugApplied: string;
  renamed: boolean;
  variantCount: number;
  /** Warnings that didn't kill the commit (R2 rename failure, poster rename failure, etc.) */
  warnings: string[];
}

/**
 * Persist the cascade artifact to JSONB + asset_categories rows.
 * Preserves operator/subscriber overrides on asset_categories.
 */
async function persistCascadeArtifact(
  assetId: string,
  analysis: CascadeAnalysis,
): Promise<{ categoryRows: number }> {
  await sql`
    UPDATE media_assets
    SET asset_analysis = ${JSON.stringify(analysis)}::jsonb, updated_at = NOW()
    WHERE id = ${assetId}
  `;

  const overrides = await sql`
    SELECT gcid, is_primary FROM asset_categories
    WHERE asset_id = ${assetId} AND assigned_by != 'auto'
  `;
  const overrideGcids = new Set(overrides.map((r) => r.gcid as string));
  const hasOverridePrimary = overrides.some((r) => r.is_primary === true);

  await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND assigned_by = 'auto'`;

  let categoryRows = 0;
  const primary = analysis.asset_categories.primary;
  if (!overrideGcids.has(primary.gcid)) {
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${primary.gcid}, ${!hasOverridePrimary},
              ${primary.confidence}, 'auto', ${primary.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }
  for (const s of analysis.asset_categories.secondaries) {
    if (overrideGcids.has(s.gcid)) continue;
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${s.gcid}, false, ${s.confidence}, 'auto', ${s.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }

  return { categoryRows };
}

export async function commitCascade(input: CommitCascadeInput): Promise<CommitCascadeResult> {
  const { assetId, analysis } = input;
  const warnings: string[] = [];

  // ── 1. Load asset state ──────────────────────────────────────────
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) throw new Error(`Asset ${assetId} not found`);

  const siteId = asset.site_id as string;
  const oldSourceUrl = asset.storage_url as string;

  // ── 2. Persist cascade artifact + structured tags ────────────────
  const { categoryRows } = await persistCascadeArtifact(assetId, analysis);

  // ── 2b. Brand matching from NER hits ─────────────────────────────
  // Vision-based brand detection was retired (hallucinated from catalog
  // payload). NER → fuzzy catalog match is the proven path. Subscriber
  // can promote suggested_new entries to catalog from the asset modal;
  // that triggers enrichBrand() via the standard POST /api/brands path.
  const nerBrandCandidates = analysis.entities.brands.map((b) => ({
    name: b.text,
    context: b.context_excerpt,
  }));
  const brandMatch = await matchBrandsFromNer(siteId, nerBrandCandidates);
  let brandRows = 0;
  for (const m of brandMatch.matched) {
    await sql`
      INSERT INTO asset_brands (asset_id, brand_id)
      VALUES (${assetId}, ${m.brand_id})
      ON CONFLICT DO NOTHING
    `;
    brandRows++;
  }

  // ── 3. Derive slug + new R2 key from cascade output ──────────────
  const slug = analysis.url_slug?.trim() || `asset-${assetId.replace(/-/g, "").slice(0, 8)}`;
  const oldKey = keyFromStorageUrl(oldSourceUrl);
  const ext = oldSourceUrl.split(".").pop()?.split("?")[0] || "bin";
  const newKey = deriveSourceKey(siteId, slug, assetId, ext);

  // ── 4. Rename source R2 key if slug differs from current key ─────
  let renamed = false;
  let currentSourceUrl = oldSourceUrl;
  if (oldKey && oldKey !== newKey) {
    try {
      const newUrl = await renameR2Object(oldKey, newKey);
      await sql`
        UPDATE media_assets
        SET storage_url = ${newUrl}, updated_at = NOW()
        WHERE id = ${assetId}
      `;
      try {
        await purgeCdnCache([oldSourceUrl]);
      } catch {
        // Non-fatal — Cloudflare will TTL out the old URL
      }
      renamed = true;
      currentSourceUrl = newUrl;
    } catch (err) {
      const msg = `R2 source rename failed: ${err instanceof Error ? err.message : err}`;
      warnings.push(msg);
      console.error(`commitCascade ${assetId}: ${msg}`);
    }
  }

  // ── 5. Rename video poster (if asset has one) ────────────────────
  if (asset.poster_asset_id) {
    try {
      const [poster] = await sql`
        SELECT id, storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}
      `;
      if (poster?.storage_url) {
        const posterUrl = poster.storage_url as string;
        const posterOldKey = keyFromStorageUrl(posterUrl);
        const posterNewKey = `sites/${siteId}/posters/${slug}-${assetId.replace(/-/g, "").slice(0, 8)}-poster.jpg`;
        if (posterOldKey && posterOldKey !== posterNewKey) {
          const posterNewUrl = await renameR2Object(posterOldKey, posterNewKey);
          await sql`
            UPDATE media_assets
            SET storage_url = ${posterNewUrl}, updated_at = NOW()
            WHERE id = ${poster.id}
          `;
          try {
            await purgeCdnCache([posterUrl]);
          } catch {
            // Non-fatal
          }
        }
      }
    } catch (err) {
      const msg = `Poster rename failed: ${err instanceof Error ? err.message : err}`;
      warnings.push(msg);
      console.warn(`commitCascade ${assetId}: ${msg}`);
    }
  }

  // ── 6. Cascade-delete existing variants + their R2 objects ───────
  const existingVariants = await sql`
    SELECT id, storage_url FROM asset_variants WHERE source_asset_id = ${assetId}
  `;
  for (const v of existingVariants) {
    const vUrl = v.storage_url as string;
    if (vUrl && vUrl.startsWith(R2_PUBLIC_DOMAIN)) {
      const vKey = keyFromStorageUrl(vUrl);
      if (vKey) {
        try {
          await deleteObjectFromR2(vKey);
        } catch {
          // Non-fatal — at worst R2 has a dangling file
        }
      }
    }
  }
  if (existingVariants.length > 0) {
    await sql`DELETE FROM asset_variants WHERE source_asset_id = ${assetId}`;
  }

  // ── 7. Stamp metadata IMMEDIATELY (before variant render) ────────
  // The cascade is "committed" once the artifact + categories + brands
  // are persisted and the source rename + variants are scheduled.
  // Stamping BEFORE the variant render means the metadata is correct
  // even if variants are slow or fail. Subscriber's Save returns
  // promptly; downstream consumers gate on asset_analysis IS NOT NULL,
  // not on variant existence.
  //
  // variants_pending=true tells consumers that variants are being
  // built in the background. Cleared when waitUntil block completes.
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      cascade_committed_at: new Date().toISOString(),
      cascade_slug: slug,
      variants_pending: true,
    })}::jsonb,
    updated_at = NOW()
    WHERE id = ${assetId}
  `;

  // ── 8. Render variants in background (Vercel waitUntil) ──────────
  // Variant render is the bottleneck (~5-30s depending on template
  // count + asset size). Moving it to waitUntil lets the commit
  // endpoint return inside the 60s Vercel function limit even when
  // renders run long. Background failures degrade gracefully —
  // variants_pending=true sticks if renders never complete, signaling
  // to the orchestrator pool query that the asset isn't ready yet.
  let variantSchedule = "scheduled (background)";
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(
      (async () => {
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
          console.log(
            `commitCascade waitUntil ${assetId}: variants=${variantResults.length} done`,
          );
        } catch (err) {
          const msg = `Variant render failed in background: ${err instanceof Error ? err.message : err}`;
          console.error(`commitCascade waitUntil ${assetId}: ${msg}`);
          // Leave variants_pending=true so consumers gate correctly.
        }
      })(),
    );
  } catch {
    // @vercel/functions unavailable (local dev). Fall back to
    // inline render — slow but functional. Subscriber may hit the
    // 60s limit in local dev; production has waitUntil.
    variantSchedule = "inline (waitUntil unavailable)";
    try {
      const variantResults = await renderAllVariantsForAsset(assetId);
      await sql`
        UPDATE media_assets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          variants_pending: false,
          variants_rendered_at: new Date().toISOString(),
          variant_count: variantResults.length,
        })}::jsonb
        WHERE id = ${assetId}
      `;
    } catch (err) {
      const msg = `Variant render failed: ${err instanceof Error ? err.message : err}`;
      warnings.push(msg);
      console.error(`commitCascade ${assetId}: ${msg}`);
    }
  }

  console.log(
    `commitCascade ${assetId}: slug="${slug}" renamed=${renamed} ` +
      `categoryRows=${categoryRows} brandRows=${brandRows} ` +
      `suggestedNewBrands=${brandMatch.suggested_new.length} ` +
      `variants=${variantSchedule} warnings=${warnings.length}`,
  );

  void currentSourceUrl;

  return {
    ok: true,
    categoryRows,
    brandRows,
    suggestedNewBrandCount: brandMatch.suggested_new.length,
    slugApplied: slug,
    renamed,
    variantCount: 0, // Variants now render in background; count unknown at return time.
    warnings,
  };
}
