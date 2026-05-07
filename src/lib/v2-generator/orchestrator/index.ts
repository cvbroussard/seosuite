import { generateV2Content } from "../core";
import type { GenerateResult } from "../types";
import { assessSite } from "./assess";
import { STRATEGY_LIST } from "./strategies";
import type { OrchestrateResult, SiteAssessment, StrategyKind } from "./types";

export type { OrchestrateResult, SiteAssessment, StrategyKind } from "./types";
export { assessSite } from "./assess";
export { STRATEGIES, STRATEGY_LIST } from "./strategies";

/**
 * Run one orchestrator tick: assess → score strategies → pick → build →
 * generate. Returns the chosen strategy + the v2 generation result.
 *
 * The orchestrator is the agency intelligence layer. Strategies are the
 * playbook plays. This function is the per-tick decision point.
 */
export async function orchestrate(
  siteId: string,
  opts?: {
    /** Force a specific strategy instead of auto-selecting. */
    forceStrategy?: StrategyKind;
    /** Pre-computed assessment (avoid re-querying when batching). */
    assessment?: SiteAssessment;
  },
): Promise<OrchestrateResult> {
  const assessment = opts?.assessment ?? await assessSite(siteId);

  // Score every strategy against this assessment.
  const scored = STRATEGY_LIST.map((s) => ({
    strategy: s,
    score: opts?.forceStrategy === s.kind ? 1 : s.score(assessment),
  }));

  // Force-strategy bypass: skip the weighted-random and try only the forced one.
  if (opts?.forceStrategy) {
    const forced = scored.find((s) => s.strategy.kind === opts.forceStrategy);
    if (!forced) throw new Error(`Forced strategy ${opts.forceStrategy} not registered`);
    const spec = await forced.strategy.build(assessment);
    if (!spec) throw new Error(`Forced strategy ${opts.forceStrategy} could not build a spec`);
    const generation = await generateV2Content(spec);
    return {
      strategy: forced.strategy.kind,
      reason: `${forced.strategy.label} (forced)`,
      generation,
    };
  }

  // Weighted-random selection across non-zero scoring strategies.
  // Each strategy's score is its selection weight. This lets the
  // orchestrator MIX strategies across a batch instead of always
  // picking the single highest-scoring one — reflects the score
  // distribution the way a content strategist would.
  //
  // Strategies that fail to build (return null) get filtered out and
  // we re-roll over the remainder until something works or we run out.
  const eligible = scored.filter((s) => s.score > 0);
  while (eligible.length > 0) {
    const totalWeight = eligible.reduce((sum, s) => sum + s.score, 0);
    let r = Math.random() * totalWeight;
    let pickedIdx = 0;
    for (let i = 0; i < eligible.length; i++) {
      r -= eligible[i].score;
      if (r <= 0) {
        pickedIdx = i;
        break;
      }
    }
    const picked = eligible[pickedIdx];
    const spec = await picked.strategy.build(assessment);
    if (spec) {
      const generation = await generateV2Content(spec);
      return {
        strategy: picked.strategy.kind,
        reason: `${picked.strategy.label} (score ${picked.score.toFixed(2)}, weighted-random)`,
        generation,
      };
    }
    // build() returned null — strategy can't materialize right now;
    // remove and re-roll.
    eligible.splice(pickedIdx, 1);
  }

  throw new Error(`No strategy could produce content for site ${siteId}`);
}

/**
 * Run multiple orchestrator ticks in sequence, re-assessing after each.
 *
 * Re-assessment matters: after every article lands, the pillar coverage
 * shifts and the unused-asset pool shrinks — so the orchestrator's
 * choice of strategy naturally evolves through the batch.
 *
 * Concurrency is intentionally NOT supported: parallel ticks would race
 * on the seed-asset pool (multiple ticks could pick the same seed before
 * the first one persists). Sequential execution keeps the assessment
 * consistent.
 */
export async function orchestrateBatch(
  siteId: string,
  count: number,
  onTick?: (i: number, result: OrchestrateResult) => void,
): Promise<OrchestrateResult[]> {
  const results: OrchestrateResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await orchestrate(siteId);
    results.push(result);
    if (onTick) onTick(i + 1, result);
  }
  return results;
}

/**
 * Returns the strategy scores for the current assessment without
 * actually generating anything. Useful for diagnostic operator UI:
 * "what would the orchestrator do right now?"
 */
export async function previewStrategies(
  siteId: string,
): Promise<Array<{ kind: StrategyKind; label: string; score: number }>> {
  const assessment = await assessSite(siteId);
  return STRATEGY_LIST
    .map((s) => ({ kind: s.kind, label: s.label, score: s.score(assessment) }))
    .sort((a, b) => b.score - a.score);
}

// Re-export for convenience (callers commonly want both)
export { generateV2Content } from "../core";
export type { GenerateResult };
