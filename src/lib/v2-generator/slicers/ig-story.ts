import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { shortestOf, makeCaption } from "./utils";

/**
 * Instagram Story: ultra-brief overlay. Pick the shortest hook.
 */
export const sliceIgStory: Slicer = (kit: ContentKit, ctx) => {
  const hook = shortestOf(kit.hooks, ctx.title || "");
  return makeCaption("ig_story", hook, kit);
};
