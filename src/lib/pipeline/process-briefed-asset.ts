import { sql } from "@/lib/db";
import { renameR2Object, keyFromStorageUrl, R2_PUBLIC_DOMAIN, deleteObjectFromR2 } from "@/lib/r2";
import { triageAsset } from "./triage";
import { generatePosterForAsset } from "./poster-gen";
import { renderAllVariantsForAsset } from "./variant-render";
import { deriveSourceKey } from "./asset-keys";
import { purgeCdnCache } from "@/lib/cdn";

/**
 * Briefing-flip orchestrator.
 *
 * Per the URL-naming architecture (LOCKED 2026-05-08): when an asset
 * transitions from `pending_briefing` to `triaged` (subscriber added a
 * substantive caption + tags + project + brands and clicked save), this
 * orchestrator runs the full pipeline that derives every URL from the
 * AI-returned `url_slug`:
 *
 *   1. Run vision triage with full briefing context (subscriber's
 *      caption + pillar + brands + project all loaded into the prompt).
 *      AI returns ai_analysis.url_slug as one of the response fields.
 *
 *   2. Rename source asset's R2 key to use the slug (deterministic
 *      hash suffix from asset UUID for collision safety). EXIF preserved
 *      via R2 server-side copy.
 *
 *   3. Delete pre-existing variants + their R2 objects (cascade, per
 *      deletion-policy: auto-generated children disappear when parent's
 *      intent changes — and a fresh briefing IS the new intent).
 *
 *   4. (Video only) Generate fresh poster with slug-derived key.
 *
 *   5. Render all 6 variants with slug-derived keys. Sharp/ffmpeg/
 *      Smart Rotate work the same; just the destination keys differ.
 *
 * This is the function the PATCH endpoint calls (via waitUntil) when
 * briefing flips. Also called by the backfill script for legacy assets.
 *
 * Idempotent on slug — re-running with same slug results in same keys.
 * Falls back gracefully when AI doesn't return a usable slug (uses asset
 * UUID prefix as the slug substitute, asset still gets rendered).
 */
export async function processBriefedAsset(assetId: string): Promise<{
  ok: boolean;
  slug: string | null;
  renamed: boolean;
  variantCount: number;
}> {
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id, metadata
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) {
    console.warn(`processBriefedAsset: asset ${assetId} not found`);
    return { ok: false, slug: null, renamed: false, variantCount: 0 };
  }

  const siteId = asset.site_id as string;
  const oldSourceUrl = asset.storage_url as string;
  const mediaType = (asset.media_type as string) || "";

  // ── 1. Vision triage with full briefing context ───────────────────
  // For video assets, vision needs an image. If we don't yet have a
  // poster (likely for new uploads under the new flow), generate one
  // with a temporary key first; we'll re-name it after we have the slug.
  let triageResult;
  try {
    if (mediaType.toLowerCase().startsWith("video") && !asset.poster_asset_id) {
      // Generate a temporary poster so vision triage has something to look at.
      // The slug-derived rename happens in step 4 once we have the slug.
      await generatePosterForAsset(assetId);
    }
    // Re-fetch in case poster_asset_id was just populated
    const [refreshed] = await sql`SELECT poster_asset_id FROM media_assets WHERE id = ${assetId}`;
    asset.poster_asset_id = refreshed?.poster_asset_id;

    // Triage runs vision against the poster (videos) or source (images)
    triageResult = await triageAsset(assetId);
  } catch (err) {
    console.error(`Triage failed in processBriefedAsset for ${assetId}:`, err instanceof Error ? err.message : err);
    // Continue anyway — fall back to no slug, original keys
    triageResult = null;
  }

  const aiSlug = (triageResult?.ai_analysis as Record<string, unknown> | undefined)?.url_slug as string | null | undefined;
  const slug = aiSlug || `asset-${assetId.replace(/-/g, "").slice(0, 8)}`;

  // ── 2. Rename source asset using slug ────────────────────────────
  const oldKey = keyFromStorageUrl(oldSourceUrl);
  const ext = oldSourceUrl.split(".").pop()?.split("?")[0] || "bin";
  const newKey = deriveSourceKey(siteId, slug, assetId, ext);
  let renamed = false;
  if (oldKey && oldKey !== newKey) {
    try {
      const newUrl = await renameR2Object(oldKey, newKey);
      await sql`
        UPDATE media_assets
        SET storage_url = ${newUrl}, updated_at = NOW()
        WHERE id = ${assetId}
      `;
      // CDN purge for the old URL — Cloudflare may have cached it
      try {
        await purgeCdnCache([oldSourceUrl]);
      } catch { /* non-fatal */ }
      renamed = true;
      asset.storage_url = newUrl;
    } catch (err) {
      console.error(`R2 rename failed for ${assetId}: ${oldKey} → ${newKey}:`, err instanceof Error ? err.message : err);
      // Continue with old URL — variant render still works, just with a
      // stale source slug
    }
  }

  // ── 3. Cascade-delete existing variants + R2 objects ─────────────
  const existingVariants = await sql`
    SELECT id, storage_url
    FROM asset_variants
    WHERE source_asset_id = ${assetId}
  `;
  for (const v of existingVariants) {
    const vUrl = v.storage_url as string;
    if (vUrl && vUrl.startsWith(R2_PUBLIC_DOMAIN)) {
      const vKey = keyFromStorageUrl(vUrl);
      if (vKey) {
        try {
          await deleteObjectFromR2(vKey);
        } catch { /* non-fatal — at worst R2 has a dangling file */ }
      }
    }
  }
  if (existingVariants.length > 0) {
    await sql`DELETE FROM asset_variants WHERE source_asset_id = ${assetId}`;
  }

  // ── 4. Re-rename poster (if exists) with slug-derived key ────────
  // Poster might have been generated in step 1 with a temporary key.
  // Move it to a slug-derived key now.
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
          } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      console.warn(`Poster rename failed for ${assetId}:`, err instanceof Error ? err.message : err);
    }
  }

  // ── 5. Render all variants with slug-derived keys ────────────────
  // renderAllVariantsForAsset picks up the now-renamed source URL and
  // derives variant keys from it via extractSlugFromSourceUrl.
  let variantResults: Array<{ variantId: string; templateId: string; status: string }> = [];
  try {
    variantResults = await renderAllVariantsForAsset(assetId);
  } catch (err) {
    console.error(`Variant render failed in processBriefedAsset for ${assetId}:`, err instanceof Error ? err.message : err);
  }

  // ── 6. Mark asset migrated + briefable ───────────────────────────
  // briefable_at coalesce — a briefed-on-upload asset that came in via
  // this orchestrator skipped the convert/poster waitUntils that normally
  // stamp it; this is the safety net.
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      url_slug_applied_at: new Date().toISOString(),
      url_slug: slug,
    })}::jsonb,
    briefable_at = COALESCE(briefable_at, NOW()),
    updated_at = NOW()
    WHERE id = ${assetId}
  `;

  return {
    ok: true,
    slug,
    renamed,
    variantCount: variantResults.length,
  };
}
