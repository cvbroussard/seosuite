import type { Strategy, StrategyKind } from "../types";

import { assetDrivenStrategy } from "./asset-driven";
import { pillarFillStrategy } from "./pillar-fill";
import { projectChapterStrategy } from "./project-chapter";
import { rewardPromptStrategy } from "./reward-prompt";
import { synthesisStrategy } from "./synthesis";

/**
 * Strategy registry. Adding a new strategy = entry here + a new file.
 * The orchestrator iterates this list to score + pick.
 */
export const STRATEGIES: Record<StrategyKind, Strategy> = {
  asset_driven: assetDrivenStrategy,
  pillar_fill: pillarFillStrategy,
  project_chapter: projectChapterStrategy,
  reward_prompt: rewardPromptStrategy,
  synthesis: synthesisStrategy,
};

export const STRATEGY_LIST: Strategy[] = Object.values(STRATEGIES);
