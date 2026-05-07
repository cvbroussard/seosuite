/**
 * v2 content generator — public API.
 *
 * Three pool adapters (one per content pool) + a slicer dispatcher.
 *
 * Usage:
 *   import { generateBlogPost, slice, sliceAll } from "@/lib/v2-generator";
 *
 *   // Generate an article (2 LLM calls)
 *   const result = await generateBlogPost({ siteId, seedAssetId });
 *
 *   // Compose-time slicing (0 LLM calls, microseconds)
 *   const fbCaption = slice("fb_feed", contentKit, { anchorUrl, title });
 *
 *   // Get all platform variants at once
 *   const allCaptions = sliceAll(contentKit, { anchorUrl, title });
 */

export { generateBlogPost, generateProjectPage, generateServicePage } from "./adapters";
export { generateV2Content } from "./core";
export { slice, sliceAll } from "./slicers";
export {
  orchestrate,
  orchestrateBatch,
  previewStrategies,
  assessSite,
  STRATEGIES,
  STRATEGY_LIST,
} from "./orchestrator";
export type {
  OrchestrateResult,
  SiteAssessment,
  StrategyKind,
} from "./orchestrator";
export { generateRewardPrompts } from "./reward-prompts/generate";
export type { RewardPrompt } from "./reward-prompts/generate";
export {
  PLATFORM_REGISTRY,
  PLATFORM_FORMATS,
  getPlatformDef,
  findFormatKey,
} from "./platform-registry";
export type { PlatformFormat, PlatformDef, Slicer, SlicerContext } from "./platform-registry";
export type {
  ContentPool,
  ContentSpec,
  ContentKit,
  GeneratedBody,
  SlicedCaption,
  GenerateResult,
} from "./types";
