import { sql } from "@/lib/db";
import type { AutopilotConfig, TriageResult, ContentPillar, PlatformFormat } from "./types";

/**
 * Triage a media asset — evaluate quality, assign pillar, determine
 * platform fit, and set triage status.
 *
 * Phase 2 stub: uses heuristic rules based on media_type and metadata.
 * Will be replaced with Claude Vision API calls for real quality scoring
 * and content classification.
 */
export async function triageAsset(assetId: string): Promise<TriageResult> {
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, context_note, transcription, metadata
    FROM media_assets
    WHERE id = ${assetId} AND triage_status = 'received'
  `;

  if (!asset) {
    throw new Error(`Asset ${assetId} not found or already triaged`);
  }

  // Fetch site config for thresholds
  const [site] = await sql`
    SELECT autopilot_config, content_pillars
    FROM sites
    WHERE id = ${asset.site_id}
  `;

  const config = (site?.autopilot_config || {}) as AutopilotConfig;
  const availablePillars = (site?.content_pillars || []) as ContentPillar[];

  // ── Heuristic triage (replaced by AI in production) ──────────
  const result = heuristicTriage(asset, config, availablePillars);

  // Persist triage result
  await sql`
    UPDATE media_assets
    SET
      triage_status = ${result.triage_status},
      quality_score = ${result.quality_score},
      content_pillar = ${result.content_pillar},
      platform_fit = ${result.platform_fit},
      flag_reason = ${result.flag_reason || null},
      shelve_reason = ${result.shelve_reason || null},
      ai_analysis = ${JSON.stringify(result.ai_analysis)},
      triaged_at = NOW()
    WHERE id = ${assetId}
  `;

  // Log triage in history
  await sql`
    INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
    VALUES (${asset.site_id}, 'triage', 'media_asset', ${assetId}, ${JSON.stringify({
      status: result.triage_status,
      quality_score: result.quality_score,
      pillar: result.content_pillar,
    })})
  `;

  return result;
}

/**
 * Heuristic triage — placeholder logic until Claude Vision is wired.
 * Uses media_type, context_note, and basic metadata to estimate quality
 * and assign pillar/platform fit.
 */
function heuristicTriage(
  asset: Record<string, unknown>,
  config: AutopilotConfig,
  pillars: ContentPillar[]
): TriageResult {
  const mediaType = asset.media_type as string;
  const contextNote = (asset.context_note as string) || "";
  const metadata = (asset.metadata || {}) as Record<string, unknown>;

  // Base quality — videos get a slight boost (more engaging)
  let quality = mediaType.startsWith("video") ? 0.65 : 0.55;

  // Context note present = subscriber cared enough to annotate
  if (contextNote.length > 10) quality += 0.1;

  // High-res metadata boost
  const width = (metadata.width as number) || 0;
  if (width >= 1080) quality += 0.1;
  if (width >= 1920) quality += 0.05;

  // Clamp to [0, 1]
  quality = Math.min(1, Math.max(0, quality));

  // Platform fit based on media type
  const platformFit: PlatformFormat[] = [];
  if (mediaType.startsWith("video")) {
    platformFit.push("ig_reel", "ig_story", "youtube_short");
    // Longer videos → youtube
    const duration = (metadata.duration_seconds as number) || 0;
    if (duration > 60) platformFit.push("youtube");
  } else if (mediaType.startsWith("image")) {
    platformFit.push("ig_feed", "ig_story", "gbp");
  }

  // Pillar assignment — subscriber-provided pillar takes precedence over heuristic
  let pillar: ContentPillar = pillars[0] || "training_action";
  const subscriberPillar = (metadata.pillar as string) || "";
  const note = contextNote.toLowerCase();

  if (subscriberPillar && pillars.includes(subscriberPillar as ContentPillar)) {
    pillar = subscriberPillar as ContentPillar;
  } else if (note.includes("before") || note.includes("after") || note.includes("result")) {
    pillar = "result";
  } else if (note.includes("hektor") || note.includes("showcase") || note.includes("demo")) {
    pillar = "showcase";
  } else if (note.includes("tip") || note.includes("how") || note.includes("explain")) {
    pillar = "educational";
  } else if (note.includes("session") || note.includes("training") || note.includes("drill")) {
    pillar = "training_action";
  }

  // Determine triage outcome
  let triageStatus: TriageResult["triage_status"] = "triaged";
  let flagReason: string | undefined;
  let shelveReason: string | undefined;

  if (quality < (config.min_quality || 0.4)) {
    triageStatus = "shelved";
    shelveReason = `Quality score ${quality.toFixed(2)} below threshold ${config.min_quality || 0.4}`;
  }

  // Flag if context note mentions people/faces and flag_faces is on
  if (config.flag_faces && /\b(face|person|people|kid|child|client)\b/i.test(contextNote)) {
    triageStatus = "flagged";
    flagReason = "Possible person/face detected in context note — verify consent";
  }

  return {
    quality_score: Math.round(quality * 100) / 100,
    content_pillar: pillar,
    platform_fit: platformFit,
    triage_status: triageStatus,
    flag_reason: flagReason,
    shelve_reason: shelveReason,
    ai_analysis: {
      engine: "heuristic-v1",
      media_type: mediaType,
      context_keywords: note.split(/\s+/).slice(0, 10),
    },
  };
}
