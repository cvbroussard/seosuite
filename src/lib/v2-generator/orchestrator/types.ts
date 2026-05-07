import type { ContentSpec, GenerateResult } from "../types";

/**
 * v2 Generation Orchestrator — types.
 *
 * Each tick the orchestrator:
 *   1. Assesses site state (pillar coverage, fresh assets, projects, goals)
 *   2. Asks every strategy to score itself (0-1) against that state
 *   3. Picks the strongest scoring strategy (with weighted-random tiebreak)
 *   4. Strategy builds a ContentSpec
 *   5. Hands off to v2 generator core
 *
 * The orchestrator is the agency intelligence layer. Strategies are the
 * playbook plays. The performance loop will eventually shape the selector.
 */

export type StrategyKind =
  | "asset_driven"
  | "reward_prompt"
  | "pillar_fill"
  | "project_chapter"
  | "synthesis";

export interface SiteAssessment {
  siteId: string;

  /** Pillar coverage map: pillar → published article count. */
  pillarCoverage: Record<string, number>;

  /** Pillars of the most recently published v2 articles (for repetition avoidance). */
  recentArticlePillars: string[];

  /** Total v2 articles published. */
  publishedCount: number;

  /** High-quality unused-as-seed asset ids (top 50). */
  freshAssetIds: string[];

  /**
   * Active projects from projects_v2. Each carries phase hint:
   * 'beginning' (no end_date, just started), 'process' (ongoing),
   * 'finished' (end_date in past).
   */
  activeProjects: Array<{
    id: string;
    name: string;
    phase: "beginning" | "process" | "finished";
  }>;

  /**
   * Business reward signals — AI-generated persuasion angles that the
   * reward-prompt strategy picks from. Generated once per site via
   * generateRewardPrompts() and stored on dna.signals.reward_prompts.
   */
  rewardSignals: {
    /** Available reward prompts for this site (full objects). */
    prompts: Array<{
      id: string;
      label: string;
      goal: string;
      intent: string;
      framingAngle: string;
      assetBias?: "proof" | "process" | "people" | "before_after";
    }>;
    /** Active goal labels (derived from prompts; for telemetry/legacy compat). */
    activeGoals: string[];
    seasonality: string | null;
  };
}

/** Result of a single orchestrator tick. */
export interface OrchestrateResult {
  strategy: StrategyKind;
  reason: string;            // human-readable why-this-strategy
  generation: GenerateResult;
}

/**
 * A generation strategy. Each strategy is a self-contained module that
 * scores itself for a given assessment, then builds a ContentSpec when
 * invoked. Adding a sixth strategy = one new file.
 */
export interface Strategy {
  kind: StrategyKind;
  /** Human-readable label for logging + telemetry. */
  label: string;

  /**
   * Score how appropriate this strategy is for the current site state.
   * 0 = not applicable / no inputs available
   * 1 = perfect fit
   * Strategies that can't run (e.g., pillar-fill with no gap) return 0.
   */
  score(assessment: SiteAssessment): number;

  /**
   * Build a ContentSpec from the assessment. May return null if the
   * strategy can't actually produce one right now (e.g., the chosen
   * pillar has no eligible assets). Orchestrator falls through to the
   * next-best strategy when this returns null.
   */
  build(assessment: SiteAssessment): Promise<ContentSpec | null>;
}
