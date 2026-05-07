import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * Pinterest: keyword-rich description for search discovery.
 * Pinterest treats hashtags as anti-feature; rely on key terms in body.
 */
export const slicePinterest: Slicer = (kit: ContentKit, ctx) => {
  const hook = firstOf(kit.hooks, ctx.title || "");
  const takeaway = firstOf(kit.takeaways);
  const keywords = kit.keyTerms.slice(0, 6).join(" • ");

  const parts = [hook];
  if (takeaway) parts.push(takeaway);
  if (keywords) parts.push(`Keywords: ${keywords}`);
  parts.push(ctx.anchorUrl);

  return makeCaption("pinterest", parts.join("\n\n"), kit);
};
