import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { shortestOf, firstOf, makeCaption } from "./utils";

/**
 * Twitter/X: hook + URL, ≤280 chars. Pick the shortest hook so we
 * have room for the URL + one hashtag.
 */
export const sliceTwitter: Slicer = (kit: ContentKit, ctx) => {
  const hook = shortestOf(kit.hooks, ctx.title || "");
  const cta = firstOf(kit.ctaVariants.short, "");
  // Reserve ~25 chars for URL + 20 for hashtag
  const text = cta && (hook.length + cta.length + 30) < 240
    ? `${hook} — ${cta}\n\n${ctx.anchorUrl}`
    : `${hook}\n\n${ctx.anchorUrl}`;

  return makeCaption("twitter", text, kit);
};
