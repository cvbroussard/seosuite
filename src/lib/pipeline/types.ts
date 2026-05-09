/** Triage statuses for media assets */
export type TriageStatus =
  | "pending_briefing" // arrived (uploaded OR AI-generated), awaiting human briefing — replaces legacy 'received'. AI triage may run for metadata enrichment but does NOT change state. Only human briefing flips to 'triaged'.
  | "received"         // DEPRECATED — kept for backward compat in old queries during cutover; rows migrated to pending_briefing
  | "triaged"          // human-briefed and ready for orchestrator pool. ONLY reached via briefing action.
  | "scheduled"        // promoted into a publishing slot
  | "shelved"          // usable but not selected (inventory for slow weeks); auto-set when quality below threshold
  | "flagged"          // AI uncertain, needs subscriber input (< 5%) — face/consent review
  | "quarantined"      // content guard violation (set by quality-gates)
  | "consumed"         // used in a published post
  | "rejected";        // subscriber vetoed or quality too low

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
  triage_status: TriageStatus; // triaged | shelved | flagged
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
