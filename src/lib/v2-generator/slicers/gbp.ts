import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Google Business Profile: location-keyword-rich. Booking CTA + link.
 * No hashtags (GBP doesn't use them).
 */
export const sliceGbp: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  const takeaway = firstOf(kit.takeaways);
  const cta = firstOf(kit.ctaVariants.medium, "Get in touch");

  const parts = [hook];
  if (takeaway) parts.push("", takeaway);
  parts.push("", `${cta} → ${ctx.anchorUrl}`);

  return makeCaption("gbp", parts.join("\n"), kit);
};
