import type { Strategy } from "../types";
import type { ContentSpec } from "../../types";

/**
 * Hybrid synthesis strategy.
 *
 * "Combine recent assets + current goal + pillar gap into the optimal
 * next article — let an LLM merge the signals before generation."
 *
 * The most sophisticated strategy. Adds an extra Haiku call (synthesis
 * prompt) before the body+kit generation to converge on the optimal
 * topic given multiple signals. Best when signal density is high enough
 * that synthesis beats single-source.
 *
 * Stub today — at low signal density (Epicurious's current state) this
 * strategy doesn't outperform asset-driven, so it scores low. Real
 * value emerges with rich performance feedback + multiple active goals.
 */
export const synthesisStrategy: Strategy = {
  kind: "synthesis",
  label: "Hybrid synthesis (multi-signal)",

  score(_assessment) {
    // Honest scoring: build() returns null until the synthesis LLM call
    // is implemented. Scoring above 0 would waste orchestrator picks
    // (weighted-random picks → null build → re-roll). Stay at 0 until
    // build lands. The "would-be score" logic from earlier is preserved
    // below as a comment so it's easy to enable when ready.
    //
    // const hasProjects = _assessment.activeProjects.length > 0;
    // const hasGoals = _assessment.rewardSignals.activeGoals.length > 0;
    // const hasImbalance = Object.values(_assessment.pillarCoverage).some(n => n > 0)
    //   && _assessment.publishedCount >= 10;
    // const dimensions = [hasProjects, hasGoals, hasImbalance].filter(Boolean).length;
    // if (dimensions < 2) return 0;
    // return 0.5 + dimensions * 0.1;
    return 0;
  },

  async build(_assessment): Promise<ContentSpec | null> {
    // Stub: real implementation would call Haiku once with a synthesis
    // prompt — "given these signals, what's the best next article?" —
    // parse the output into a ContentSpec with topicHint + intent +
    // biased asset selection. Defer until signal density justifies.
    return null;
  },
};
