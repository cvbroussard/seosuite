import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Instagram Reel: very short. Hook only — first ~125 chars are what
 * shows before the "more" truncation.
 */
export const sliceIgReel: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  return makeCaption("ig_reel", hook, kit);
};
