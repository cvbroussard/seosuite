import type { ContentKit, SlicedCaption } from "./types";

/**
 * Single source of truth for every supported platform format.
 *
 * Adding a new format = one entry here + one slicer file under ./slicers/.
 * Everything else (TypeScript types, post_templates seed, format
 * inference, hashtag count rules) derives from this registry.
 *
 * Replaces:
 *   - PLATFORM_RULES const in src/lib/pipeline/caption-generator.ts
 *   - templateToPlatformFormat() map in same file
 *   - the static pillarHashtags lookup in /api/compose/recommend/route.ts
 *   - drift between post_templates seed rows and code-side format keys
 */

export type PlatformKey = string; // narrowed via `keyof typeof PLATFORM_REGISTRY` below

/** Slicer signature — every format implements this. */
export type Slicer = (kit: ContentKit, ctx: SlicerContext) => SlicedCaption;

export interface SlicerContext {
  /** The anchor URL (where the post points). May be embedded inline or omitted per format. */
  anchorUrl: string;
  /** Article title — useful for fallback hooks when kit is sparse. */
  title?: string;
}

export interface PlatformDef {
  /** Subscriber-facing label. */
  label: string;
  /** post_templates.platform value. */
  platform: "facebook" | "instagram" | "twitter" | "linkedin" | "tiktok" | "youtube" | "pinterest" | "gbp";
  /** post_templates.format value. */
  format: string;

  /** Caption hard cap. */
  maxLength: number;
  /** Acceptable hashtag count range for this format. */
  hashtagRange: [number, number];
  /** Style hint (used by future LLM-polish layer if we ever add one). */
  style: string;

  /** Asset constraints. */
  allowedAssetTypes: ("image" | "video")[];
  slotCount: { min: number; max: number };

  /** Whether the format renders inline URLs as clickable text. */
  supportsInlineLink: boolean;
  /** Whether boost-after-publish applies. */
  supportsBoosting: boolean;
}

export const PLATFORM_REGISTRY = {
  fb_feed: {
    label: "Facebook Feed",
    platform: "facebook",
    format: "single_image",
    maxLength: 63206,
    hashtagRange: [3, 5],
    style: "Conversational and engaging. Hook in first line. Line breaks between ideas. Soft CTA. Inline link.",
    allowedAssetTypes: ["image", "video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: true,
    supportsBoosting: true,
  },
  fb_carousel: {
    label: "Facebook Carousel",
    platform: "facebook",
    format: "carousel",
    maxLength: 63206,
    hashtagRange: [3, 5],
    style: "Conversational. Each slide complements the caption arc. Inline link.",
    allowedAssetTypes: ["image"],
    slotCount: { min: 2, max: 10 },
    supportsInlineLink: true,
    supportsBoosting: true,
  },
  fb_video: {
    label: "Facebook Video",
    platform: "facebook",
    format: "video",
    maxLength: 63206,
    hashtagRange: [3, 5],
    style: "Conversational, video-aware framing. Inline link.",
    allowedAssetTypes: ["video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: true,
    supportsBoosting: true,
  },
  fb_reel: {
    label: "Facebook Reel",
    platform: "facebook",
    format: "reel",
    maxLength: 2200,
    hashtagRange: [3, 5],
    style: "Short hook. Reel-aware. No inline link (reel surfaces hide them).",
    allowedAssetTypes: ["video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: false,
    supportsBoosting: true,
  },
  ig_feed: {
    label: "Instagram Feed",
    platform: "instagram",
    format: "single_image",
    maxLength: 2200,
    hashtagRange: [8, 15],
    style: "Conversational with hook in first line. Line breaks. CTA at end. Bio link only — never inline URL.",
    allowedAssetTypes: ["image"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: false,
    supportsBoosting: true,
  },
  ig_carousel: {
    label: "Instagram Carousel",
    platform: "instagram",
    format: "carousel",
    maxLength: 2200,
    hashtagRange: [8, 15],
    style: "Hook + arc across slides. Bio link only.",
    allowedAssetTypes: ["image"],
    slotCount: { min: 2, max: 10 },
    supportsInlineLink: false,
    supportsBoosting: true,
  },
  ig_reel: {
    label: "Instagram Reel",
    platform: "instagram",
    format: "reel",
    maxLength: 2200,
    hashtagRange: [5, 10],
    style: "Short and punchy. ~125 chars max for visibility before truncation. No inline link.",
    allowedAssetTypes: ["video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: false,
    supportsBoosting: true,
  },
  ig_story: {
    label: "Instagram Story",
    platform: "instagram",
    format: "story",
    maxLength: 200,
    hashtagRange: [0, 3],
    style: "Ultra-brief. One line. Overlays on the visual.",
    allowedAssetTypes: ["image", "video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: false,
    supportsBoosting: false,
  },
  twitter: {
    label: "Twitter / X",
    platform: "twitter",
    format: "post",
    maxLength: 280,
    hashtagRange: [1, 2],
    style: "Concise and punchy. Hook + link.",
    allowedAssetTypes: ["image", "video"],
    slotCount: { min: 0, max: 4 },
    supportsInlineLink: true,
    supportsBoosting: false,
  },
  linkedin: {
    label: "LinkedIn",
    platform: "linkedin",
    format: "post",
    maxLength: 3000,
    hashtagRange: [3, 5],
    style: "Lead statement + lesson + question. Professional. Inline link.",
    allowedAssetTypes: ["image", "video"],
    slotCount: { min: 0, max: 1 },
    supportsInlineLink: true,
    supportsBoosting: false,
  },
  pinterest: {
    label: "Pinterest Pin",
    platform: "pinterest",
    format: "tall_pin",
    maxLength: 500,
    hashtagRange: [0, 0],
    style: "Keyword-rich description for search. Describes the image + why it matters. Pin-specific URL context.",
    allowedAssetTypes: ["image"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: true,
    supportsBoosting: false,
  },
  gbp: {
    label: "Google Business Profile",
    platform: "gbp",
    format: "post",
    maxLength: 1500,
    hashtagRange: [0, 0],
    style: "Professional, location-keyword-rich. City + service keywords. Booking CTA + link.",
    allowedAssetTypes: ["image"],
    slotCount: { min: 0, max: 1 },
    supportsInlineLink: true,
    supportsBoosting: false,
  },
  youtube_short: {
    label: "YouTube Short",
    platform: "youtube",
    format: "short",
    maxLength: 100,
    hashtagRange: [3, 5],
    style: "Very short, attention-grabbing. Reel-style.",
    allowedAssetTypes: ["video"],
    slotCount: { min: 1, max: 1 },
    supportsInlineLink: false,
    supportsBoosting: false,
  },
} as const satisfies Record<string, PlatformDef>;

export type PlatformFormat = keyof typeof PLATFORM_REGISTRY;

/** All registry keys as a runtime array — useful for iteration. */
export const PLATFORM_FORMATS = Object.keys(PLATFORM_REGISTRY) as PlatformFormat[];

/** Look up a platform definition with a clear error if the key is bogus. */
export function getPlatformDef(format: PlatformFormat): PlatformDef {
  const def = PLATFORM_REGISTRY[format] as PlatformDef;
  if (!def) throw new Error(`Unknown platform format: ${format}`);
  return def;
}

/**
 * Map a (platform, format) tuple from a post_templates row to a
 * registry key. Returns null when no matching format exists.
 */
export function findFormatKey(platform: string, format: string): PlatformFormat | null {
  for (const [key, def] of Object.entries(PLATFORM_REGISTRY)) {
    if (def.platform === platform && def.format === format) {
      return key as PlatformFormat;
    }
  }
  return null;
}
