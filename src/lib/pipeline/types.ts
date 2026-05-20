/**
 * Asset processing stage — the monotonic preparation pipeline.
 *
 * DB column: `media_assets.processing_stage` — CHECK-constrained,
 * NOT NULL, default 'uploaded'.
 *
 * This is the SINGLE source of truth for the value set. It is
 * deliberately ONLY the processing axis. Two things that used to be
 * commingled here now live elsewhere:
 *   - Liveness (archived) → orthogonal `archived_at` timestamp.
 *   - Utilization (scheduled/consumed) → a derived usage history,
 *     never a stored status value.
 */
export type ProcessingStage =
  | "uploaded"   // baseline processing in progress (HEIC convert, video poster, EXIF, R2, URL catalog)
  | "onboarded"  // baseline processing done — asset is in the system, awaiting human briefing
  | "briefed"    // transcription saved (human briefing complete)
  | "analyzed"   // cascade committed — asset_analysis populated; the consumable gate
  | "failed";    // terminal — baseline processing exhausted retries; recovery is re-upload

/** Content pillars — rotated through the publishing calendar */
export type ContentPillar =
  | "result"           // before/after transformations
  | "training_action"  // session clips, technique demos
  | "showcase"         // Hektor or standout dogs
  | "educational";     // tips, breed info, methodology

/** Platform format identifiers */
export type PlatformFormat =
  | "ig_feed"
  | "ig_reel"
  | "ig_story"
  | "fb_feed"
  | "fb_reel"
  | "youtube"
  | "youtube_short"
  | "gbp"
  | "tiktok"
  | "twitter"
  | "linkedin"
  | "pinterest";

/** Publishing slot statuses */
export type SlotStatus =
  | "open"       // slot exists, no asset assigned yet
  | "filled"     // asset promoted, post created
  | "published"  // post went live
  | "skipped"    // no inventory to fill this slot
  | "vetoed";    // subscriber pulled back the post

/** Post authority — who/what created the post */
export type PostAuthority =
  | "pipeline"    // autopilot system
  | "subscriber"  // manual creation
  | "trigger";    // automation trigger

/** Subscriber action types — the narrow set of things subscribers can do */
export type SubscriberActionType =
  | "veto"
  | "un_veto"
  | "flag_response"
  | "cadence_change"
  | "triage"
  | "edit";

/** Cadence config shape stored in sites.cadence_config */
export interface CadenceConfig {
  ig_feed?: number;
  ig_reel?: number;
  ig_story?: number;
  fb_feed?: number;
  fb_reel?: number;
  youtube?: number;
  youtube_short?: number;
  gbp?: number;
  tiktok?: number;
  twitter?: number;
  linkedin?: number;
  pinterest?: number;
}

/** Autopilot config shape stored in sites.autopilot_config */
export interface AutopilotConfig {
  min_quality: number;
  flag_faces: boolean;
  shelf_capacity: number;
  max_flag_rate: number;
  veto_window_hours: number;
  backfill_from_shelf: boolean;
}

/** AI triage result returned by the triage engine */
export interface TriageResult {
  quality_score: number;       // 0.00 – 1.00
  content_pillar: ContentPillar;   // AI's single confident pick
  content_pillars: ContentPillar[]; // mirror of [content_pillar] until subscriber multi-selects
  scene_types: string[];       // composition vocabulary from src/lib/scene-types.ts
  content_tags: string[];      // specific tags from two-tier system
  platform_fit: PlatformFormat[];
  processing_stage: ProcessingStage;
  flag_reason?: string;
  shelve_reason?: string;
  ai_analysis: Record<string, unknown>;
  generated_text?: {
    context_note: string;
    pin_headline: string;
    display_caption: string;
    alt_text: string;
    social_hook: string;
    generated_at: string;
  };
}
