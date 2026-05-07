import type { ContentKit } from "../types";
import type { Slicer } from "../platform-registry";
import { firstOf, makeCaption } from "./utils";

/**
 * LinkedIn: lead statement + lesson + question + inline link.
 * Slightly longer-form. Professional register.
 */
export const sliceLinkedin: Slicer = (kit: ContentKit, ctx) => {
  const lead = firstOf(kit.hooks, ctx.title || "");
  const lesson = firstOf(kit.takeaways);
  const proof = firstOf(kit.proofPoints);
  const linkContext = firstOf(kit.inlineLinkContexts, "Full breakdown");

  const parts = [lead];
  if (lesson) parts.push("", lesson);
  if (proof) parts.push("", proof);
  parts.push("", `${linkContext}: ${ctx.anchorUrl}`);
  parts.push("", "What's your take?");

  return makeCaption("linkedin", parts.join("\n"), kit);
};
