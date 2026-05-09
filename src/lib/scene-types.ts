/**
 * Scene Composition registry — platform-wide vocabulary for what's
 * actually shown in an image's frame.
 *
 * Per the AI tagging architecture (LOCKED 2026-05-09): the modal's
 * "Scene Composition" column lets the subscriber multi-select from this
 * fixed set. AI pre-checks its best matches at briefing-flip; subscriber
 * owns the final array. This is distinct from "Story Angle" (pillars):
 *
 *   Story Angle   = INTENT  — what the asset is meant to SAY (guides copy)
 *   Scene Composition = COMPOSITION — what the asset literally SHOWS
 *
 * Cross-cutting categories — assets can legitimately be multiple:
 *   FRAMING:  wide_shot, close_up
 *   SUBJECT:  in_progress, people
 *   TEMPORAL: before, after
 *   FORMAT:   documentation, lifestyle
 */

export interface SceneType {
  /** Stable ID — never changes. Used in DB + AI prompt. */
  id: string;
  /** Subscriber-facing label. */
  label: string;
  /** Short description shown inline under the checkbox. */
  description: string;
}

export const SCENE_TYPES: SceneType[] = [
  {
    id: "wide_shot",
    label: "Wide Shot",
    description: "Whole space or subject in frame. Establishes context.",
  },
  {
    id: "close_up",
    label: "Close-Up",
    description: "Detail of a material, finish, or feature. Shows craftsmanship.",
  },
  {
    id: "in_progress",
    label: "In Progress",
    description: "Active work or mid-task. Shows the doing, not just the done.",
  },
  {
    id: "people",
    label: "People",
    description: "Humans visible in the frame. Puts a face on the work.",
  },
  {
    id: "before",
    label: "Before",
    description: "Pre-work or starting state. Anchors a transformation story.",
  },
  {
    id: "after",
    label: "After",
    description: "Completed result. The final reveal.",
  },
  {
    id: "documentation",
    label: "Documentation",
    description: "Plans, diagrams, sketches, or screenshots.",
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    description: "Finished space being lived in or used naturally.",
  },
];

export const SCENE_TYPE_IDS = SCENE_TYPES.map((s) => s.id);

export function sceneTypeLabel(id: string): string {
  return SCENE_TYPES.find((s) => s.id === id)?.label || id.replace(/_/g, " ");
}

export function isValidSceneTypeId(id: string): boolean {
  return SCENE_TYPE_IDS.includes(id);
}

/**
 * Maps the legacy single-string scene_type vocabulary that AI was returning
 * before this lockdown (environment / method / product / humans / region) to
 * the new composition-focused multi-array vocabulary. Used by migration #104
 * to backfill scene_types on existing media_assets so they aren't empty.
 *
 * Mappings are best-effort (one→one or two); subscriber will overwrite at
 * next briefing touch. Anything unmapped → empty array.
 */
export const LEGACY_SCENE_TYPE_MAP: Record<string, string[]> = {
  environment: ["wide_shot"],
  method: ["in_progress"],
  product: ["after", "close_up"],
  humans: ["people"],
  region: ["wide_shot"],
};
