import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Facebook Feed: hook + 1-2 takeaways + inline link + soft CTA.
 * Conversational, line breaks between ideas.
 */
export const sliceFbFeed: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  const takeaway = firstOf(kit.takeaways);
  const linkContext = firstOf(kit.inlineLinkContexts, "Read more");
  const cta = firstOf(kit.ctaVariants.medium, "");

  const parts = [hook];
  if (takeaway) parts.push("", takeaway);
  parts.push("", `${linkContext}: ${ctx.anchorUrl}`);
  if (cta) parts.push("", cta);

  return makeCaption("fb_feed", parts.join("\n"), kit);
};
