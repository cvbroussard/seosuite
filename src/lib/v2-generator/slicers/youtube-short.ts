import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { shortestOf, makeCaption } from "./utils";

/**
 * YouTube Short: very short title-style line. ≤100 chars hard cap.
 */
export const sliceYoutubeShort: Slicer = (kit: ContentKit, ctx) => {
  const hook = shortestOf(kit.hooks, ctx.title || "");
  return makeCaption("youtube_short", hook, kit);
};
