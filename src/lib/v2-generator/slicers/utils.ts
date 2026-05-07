import type { ContentKit, SlicedCaption } from "../types";
import { getPlatformDef, type PlatformFormat } from "../platform-registry";

/** Pick the first non-empty entry from an ordered list, or fall back. */
export function firstOf(list: string[] | undefined, fallback = ""): string {
  if (!list) return fallback;
  for (const item of list) {
    const t = (item || "").trim();
    if (t) return t;
  }
  return fallback;
}

/** Pick the shortest entry; useful for length-constrained formats. */
export function shortestOf(list: string[] | undefined, fallback = ""): string {
  if (!list || list.length === 0) return fallback;
  return list
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .reduce((best, cur) => (cur.length < best.length ? cur : best), list[0]);
}

/** Truncate to fit within maxLength, preferring word boundaries. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/**
 * Convert a free-form term to a PascalCase hashtag.
 * "kitchen design" → "KitchenDesign"
 * "rift-sawn white oak" → "RiftSawnWhiteOak"
 */
export function toHashtag(raw: string): string {
  const cleaned = (raw || "")
    .normalize("NFKD")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  return cleaned ? `#${cleaned}` : "";
}

/**
 * Build a hashtag set from key terms (and optional content tags),
 * sized to the format's hashtagRange.
 */
export function composeHashtags(
  format: PlatformFormat,
  kit: ContentKit,
  extraTerms: string[] = [],
): string[] {
  const def = getPlatformDef(format);
  const [, max] = def.hashtagRange;
  if (max === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...kit.keyTerms, ...extraTerms]) {
    if (out.length >= max) break;
    const tag = toHashtag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Apply voice markers — exclamations, signoffs, casing — to a caption. */
export function applyVoice(caption: string, kit: ContentKit): string {
  let out = caption;

  // Casing
  if (kit.voiceMarkers.casing === "lowercase") {
    out = out.toLowerCase();
  } else if (kit.voiceMarkers.casing === "title") {
    // Light touch — capitalize each word; rare but supported
    out = out.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Sentence is the default; no transformation needed.

  return out;
}

/** Standard SlicedCaption builder so every slicer returns a consistent shape. */
export function makeCaption(
  format: PlatformFormat,
  text: string,
  kit: ContentKit,
  extraHashtagTerms: string[] = [],
): SlicedCaption {
  const def = getPlatformDef(format);
  return {
    caption: truncate(applyVoice(text, kit), def.maxLength),
    hashtags: composeHashtags(format, kit, extraHashtagTerms),
  };
}
