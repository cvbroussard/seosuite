import "server-only";
import { sql } from "@/lib/db";
import { getAssetNarrative } from "@/lib/asset-narrative";
import type { NarrativeThread } from "./director";

/**
 * Director Call inputs gathered for a still→video render.
 *
 * The director module itself does no DB work — this helper is the
 * single place that assembles its inputs from the database, so both
 * the variant render path and the director-prompt inspector run off
 * identical context with no drift.
 */
export interface DirectorContext {
  /** Source still URL — Kling's first frame, the Director's vision input. */
  imageUrl: string;
  /** The script — briefing transcript (recordings, context_note fallback). */
  transcript: string | null;
  /** ai_analysis JSON — scene_type, description, detected entities. */
  analysis: Record<string, unknown> | null;
  /** Creator caption — narrative fallback when transcript is thin. */
  contextNote: string | null;
  /** Brand DNA voice signals — tone, distinctive traits. */
  brandVoice: Record<string, unknown> | null;
  /** Threads already amplified for this asset (variety constraint). */
  previousThreads: NarrativeThread[];
}

/**
 * Assemble the Director Call inputs for an asset. Self-contained — one
 * call, just an assetId. Safe to call from the render pipeline and the
 * inspector alike.
 *
 * previousThreads reads the threads already amplified for this asset
 * from sibling variants' audit trail, so the Director can deliberately
 * pick a different one. Because the video templates render sequentially
 * and each persists its brief before the next starts, the Nth call sees
 * the prior N-1 threads.
 */
export async function gatherDirectorContext(
  assetId: string,
): Promise<DirectorContext | null> {
  const [asset] = await sql`
    SELECT ma.storage_url, ma.ai_analysis, ma.context_note, s.brand_dna
    FROM media_assets ma JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;
  if (!asset) return null;

  const narrative = await getAssetNarrative(assetId);

  // Brand voice lives at brand_dna.signals.voice (v2 brand DNA shape).
  const brandDna = (asset.brand_dna as Record<string, unknown> | null) || {};
  const signals = (brandDna.signals as Record<string, unknown> | null) || {};
  const brandVoice = (signals.voice as Record<string, unknown> | null) || null;

  const threadRows = await sql`
    SELECT DISTINCT render_settings->'director'->>'thread_used' AS thread
    FROM asset_variants
    WHERE source_asset_id = ${assetId}
      AND render_settings->'director'->>'thread_used' IS NOT NULL
  `;
  const previousThreads = threadRows
    .map((r) => r.thread as string)
    .filter(Boolean) as NarrativeThread[];

  return {
    imageUrl: (asset.storage_url as string) || "",
    transcript: narrative.text || null,
    analysis: (asset.ai_analysis as Record<string, unknown> | null) || null,
    contextNote: (asset.context_note as string | null) || null,
    brandVoice,
    previousThreads,
  };
}
