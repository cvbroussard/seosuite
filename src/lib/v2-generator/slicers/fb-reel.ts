import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Facebook Reel: short hook only. No inline link (Reel surfaces hide
 * them). Optional follow-up takeaway if it stays under ~150 chars.
 */
export const sliceFbReel: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  const takeaway = firstOf(kit.takeaways);

  // Only include takeaway if combined length is still tight.
  const combined = takeaway && hook.length + takeaway.length < 150
    ? `${hook}\n\n${takeaway}`
    : hook;

  return makeCaption("fb_reel", combined, kit);
};
