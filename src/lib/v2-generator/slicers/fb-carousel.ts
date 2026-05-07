import type { Slicer } from "../platform-registry";
import { sliceFbFeed } from "./fb-feed";

/**
 * Facebook Carousel: same caption shape as Feed; the per-slide
 * variation is rendered in the carousel cards themselves, not the
 * top-level caption.
 */
export const sliceFbCarousel: Slicer = (kit, ctx) => sliceFbFeed(kit, ctx);
