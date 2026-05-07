import { PLATFORM_REGISTRY, type PlatformFormat, type Slicer, type SlicerContext } from "../platform-registry";
import type { ContentKit, SlicedCaption } from "../types";

import { sliceFbFeed } from "./fb-feed";
import { sliceFbCarousel } from "./fb-carousel";
import { sliceFbVideo } from "./fb-video";
import { sliceFbReel } from "./fb-reel";
import { sliceIgFeed } from "./ig-feed";
import { sliceIgCarousel } from "./ig-carousel";
import { sliceIgReel } from "./ig-reel";
import { sliceIgStory } from "./ig-story";
import { sliceTwitter } from "./twitter";
import { sliceLinkedin } from "./linkedin";
import { slicePinterest } from "./pinterest";
import { sliceGbp } from "./gbp";
import { sliceYoutubeShort } from "./youtube-short";

/**
 * Slicer dispatch — keyed by PlatformFormat.
 *
 * The platform registry is purely metadata (readonly). Slicer
 * functions live here. Adding a new platform = entry in the registry
 * + entry in this map + the slicer file. Type system requires every
 * registry key to have a slicer (Record<PlatformFormat, Slicer>).
 */
const SLICERS: Record<PlatformFormat, Slicer> = {
  fb_feed: sliceFbFeed,
  fb_carousel: sliceFbCarousel,
  fb_video: sliceFbVideo,
  fb_reel: sliceFbReel,
  ig_feed: sliceIgFeed,
  ig_carousel: sliceIgCarousel,
  ig_reel: sliceIgReel,
  ig_story: sliceIgStory,
  twitter: sliceTwitter,
  linkedin: sliceLinkedin,
  pinterest: slicePinterest,
  gbp: sliceGbp,
  youtube_short: sliceYoutubeShort,
};

/**
 * Slice a content kit into a per-format caption + hashtags.
 * No LLM. Microseconds. Deterministic.
 */
export function slice(
  format: PlatformFormat,
  kit: ContentKit,
  ctx: SlicerContext,
): SlicedCaption {
  const slicer = SLICERS[format];
  if (!slicer) {
    throw new Error(`No slicer registered for platform format: ${format}`);
  }
  return slicer(kit, ctx);
}

/**
 * Slice for every supported format at once. Useful for caches /
 * preview surfaces / debug tools.
 */
export function sliceAll(
  kit: ContentKit,
  ctx: SlicerContext,
): Record<PlatformFormat, SlicedCaption> {
  const out = {} as Record<PlatformFormat, SlicedCaption>;
  for (const key of Object.keys(PLATFORM_REGISTRY) as PlatformFormat[]) {
    out[key] = SLICERS[key](kit, ctx);
  }
  return out;
}
