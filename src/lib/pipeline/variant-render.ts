import { sql } from "@/lib/db";

/**
 * Variant render worker (#163).
 *
 * When an asset is briefed (triage_status flips to 'triaged'), trigger
 * default-template variant rendering. The orchestrator (#168) only
 * picks assets that have a ready variant for the target template, so
 * this worker is what makes briefed assets eligible for autopilot.
 *
 * Implementation note (2026-05-08):
 * v1 ships as STUB rendering — variant rows are created with the source
 * URL as storage_url and variant_status='ready'. Meta and most platforms
 * accept the source asset and apply their own crop-for-placement, so
 * subscribers can publish without FFmpeg-based rendering.
 *
 * Real per-template rendering (sharp for images, FFmpeg for video) is a
 * follow-up. Adds storage cost + render time but produces platform-native
 * specs that minimize re-encoding artifacts. Tracked separately.
 *
 * Architecture rationale:
 * - We render ON briefing (eager), not on publish (lazy). Predictable —
 *   orchestrator never gambles on a render succeeding at publish time.
 * - Only the default template renders automatically. Other templates can
 *   be rendered on subscriber request (Tools hub) or operator action.
 * - Variants gate orchestrator pool eligibility per project_tracpost_source_template_variants.md.
 */

/**
 * Determine the default template for an asset based on media type.
 * Per project_tracpost_render_format_default.md, Reel-first is the
 * default for video. Stills default to feed_square (universal); subscribers
 * can request additional templates from the Tools hub.
 */
export function getDefaultTemplate(mediaType: string): string {
  const lower = (mediaType || "").toLowerCase();
  if (lower.startsWith("video") || lower.includes("video/")) return "reel_9x16";
  if (lower === "audio" || lower.startsWith("audio")) return "feed_square"; // audiogram-format
  // Default for images: feed_square. Subscribers can request reel_9x16 (Ken Burns) separately.
  return "feed_square";
}

export interface VariantRenderResult {
  variantId: string;
  templateId: string;
  status: "ready" | "failed" | "pending";
}

/**
 * Render the default template variant for an asset. Idempotent —
 * if a variant already exists for that template, returns the existing one.
 *
 * Returns null on hard failure (asset not found, template not found).
 *
 * v1 STUB: variant_status='ready' immediately; storage_url = source URL.
 * Real cropping/encoding is a follow-up enhancement.
 */
export async function renderDefaultVariant(
  assetId: string,
): Promise<VariantRenderResult | null> {
  // Fetch asset
  const [asset] = await sql`
    SELECT id, storage_url, media_type, triage_status
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) return null;

  const templateId = getDefaultTemplate(asset.media_type as string);

  // Check if variant already exists for this (asset, template) — idempotent
  const [existing] = await sql`
    SELECT id, variant_status FROM asset_variants
    WHERE source_asset_id = ${assetId} AND template_id = ${templateId}
  `;
  if (existing) {
    return {
      variantId: existing.id as string,
      templateId,
      status: existing.variant_status as "ready" | "failed" | "pending",
    };
  }

  // STUB render — record variant with source URL. Real cropping is a follow-up.
  // Platform-native rendering still advisable later to minimize re-encode artifacts.
  const renderSettings = {
    stub_render: true,
    note: "v1 stub — uses source URL; real per-template render is a follow-up",
    triggered_at: new Date().toISOString(),
  };

  const [inserted] = await sql`
    INSERT INTO asset_variants (
      source_asset_id, template_id, storage_url, render_settings,
      variant_status, quality_score, generated_at
    ) VALUES (
      ${assetId}, ${templateId}, ${asset.storage_url}, ${JSON.stringify(renderSettings)}::jsonb,
      'ready', 1.0, NOW()
    )
    RETURNING id
  `;

  return {
    variantId: inserted.id as string,
    templateId,
    status: "ready",
  };
}

/**
 * Render a specific (non-default) template variant for an asset. Used by
 * Tools-hub or operator actions when subscribers want multi-platform
 * coverage beyond the default.
 *
 * Validates that the requested template exists in asset_templates.
 */
export async function renderTemplateVariant(
  assetId: string,
  templateId: string,
): Promise<VariantRenderResult | null> {
  const [tpl] = await sql`SELECT id FROM asset_templates WHERE id = ${templateId}`;
  if (!tpl) return null;

  const [asset] = await sql`
    SELECT id, storage_url FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return null;

  const [existing] = await sql`
    SELECT id, variant_status FROM asset_variants
    WHERE source_asset_id = ${assetId} AND template_id = ${templateId}
  `;
  if (existing) {
    return {
      variantId: existing.id as string,
      templateId,
      status: existing.variant_status as "ready" | "failed" | "pending",
    };
  }

  const [inserted] = await sql`
    INSERT INTO asset_variants (
      source_asset_id, template_id, storage_url, render_settings,
      variant_status, quality_score, generated_at
    ) VALUES (
      ${assetId}, ${templateId}, ${asset.storage_url},
      ${JSON.stringify({ stub_render: true, requested_at: new Date().toISOString() })}::jsonb,
      'ready', 1.0, NOW()
    )
    RETURNING id
  `;

  return {
    variantId: inserted.id as string,
    templateId,
    status: "ready",
  };
}

/**
 * Mark variants stale when source asset is modified. Called from the
 * asset PATCH handler when storage_url or critical metadata changes.
 * Stale variants get re-rendered on next pool query.
 */
export async function markVariantsStale(assetId: string): Promise<number> {
  const result = await sql`
    UPDATE asset_variants
    SET variant_status = 'stale'
    WHERE source_asset_id = ${assetId} AND variant_status = 'ready'
    RETURNING id
  `;
  return result.length;
}
