import type { Slicer } from "../platform-registry";
import { sliceFbFeed } from "./fb-feed";

/**
 * Facebook Video: same shape as Feed; the visual is video instead of
 * still. Caption is identical structurally.
 */
export const sliceFbVideo: Slicer = (kit, ctx) => sliceFbFeed(kit, ctx);
