import type { Slicer } from "../platform-registry";
import { sliceIgFeed } from "./ig-feed";

/**
 * Instagram Carousel: same caption structure as Feed; per-slide text
 * is rendered on the cards themselves, not in the top caption.
 */
export const sliceIgCarousel: Slicer = (kit, ctx) => sliceIgFeed(kit, ctx);
