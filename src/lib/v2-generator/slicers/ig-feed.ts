import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Instagram Feed: hook + 1-2 takeaways + CTA. NO inline link
 * (IG hides them; convention is "link in bio").
 */
export const sliceIgFeed: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  const takeaway = firstOf(kit.takeaways);
  const cta = firstOf(kit.ctaVariants.short, "");

  const parts = [hook];
  if (takeaway) parts.push("", takeaway);
  if (cta) parts.push("", cta);
  // No anchor URL — bio link convention.

  return makeCaption("ig_feed", parts.join("\n"), kit);
};
