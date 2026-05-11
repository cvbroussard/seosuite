/**
 * Per-tag-group rules governing the auto-tag matching algorithm.
 *
 * LOCKED 2026-05-10. Different tag groups have meaningfully different
 * risk profiles for catalog-match noise and NER suggestion quality —
 * a single algorithm can't serve all 6 groups well. These rules are
 * the per-group knobs.
 *
 * See:
 *   memory/project_tracpost_auto_tag_inspector_design.md
 *
 * v1: hard-coded defaults. Operator-tunable per-business overrides
 * (DB table) can come later if real-world tuning need surfaces.
 */

export type TagGroup =
  | "brand"
  | "service"
  | "project"
  | "persona"
  | "branch"
  | "service_area";

export type AutoTagRules = {
  /** Skip catalog match if entity name is shorter than this many chars. */
  min_match_chars: number;
  /** Skip catalog match if entity name has fewer than this many words. */
  min_match_words: number;
  /** Use \b word-boundary regex (true) or raw substring (false). */
  word_boundary_required: boolean;
  /** If catalog match found, auto-link to asset_*_join (server-side, pre-checked pill). */
  allow_auto_link_existing: boolean;
  /** NER may surface new-entity candidates for subscriber confirmation. */
  allow_suggest_create_new: boolean;
  /** NER may CREATE + LINK new entities WITHOUT subscriber confirmation. Almost always N — too risky. */
  allow_auto_create_new: boolean;
};

export const AUTO_TAG_RULES: Record<TagGroup, AutoTagRules> = {
  brand: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Sonnet NER for proper-noun brands (Thermador, Brizo) is the one
    // case where world-knowledge usefully proposes new entities.
    allow_suggest_create_new: true,
    allow_auto_create_new: false,
  },
  service: {
    min_match_chars: 4,
    // Forces multi-word service names. Single-word ("Plumbing") is
    // too generic and produces noise from common transcript words.
    min_match_words: 2,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Subscriber-defined; world-knowledge irrelevant for "Kitchen
    // remodel" vs "Custom kitchen design".
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
  },
  project: {
    min_match_chars: 5,
    // The load-bearing rule: distinguishes "Point Breeze kitchen
    // remodel" (legitimate project match) from "kitchen" (noise).
    min_match_words: 2,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
  },
  persona: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Privacy-excluded — NER never surfaces person mentions.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
  },
  branch: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Operator-managed structural units; not extractable from world knowledge.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
  },
  service_area: {
    min_match_chars: 4,
    min_match_words: 1,
    word_boundary_required: true,
    // Existing site overlay matches are unambiguous (subscriber
    // already chose which canonical to link).
    allow_auto_link_existing: true,
    // Disabled until proximity-anchored canonical dedup ships —
    // Point Breeze cross-canonical ambiguity unresolved.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
  },
};

/**
 * Check if an entity name passes the per-group rules for catalog
 * matching. Used by the inspector's catalog-scan loop to skip
 * entities that are ineligible (too short, too few words, or group
 * has auto-link disabled) before running the regex.
 */
export function entityNameEligibleForCatalogMatch(
  group: TagGroup,
  name: string,
): boolean {
  const rules = AUTO_TAG_RULES[group];
  if (!rules.allow_auto_link_existing) return false;
  const trimmed = name.trim();
  if (trimmed.length < rules.min_match_chars) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < rules.min_match_words) return false;
  return true;
}

export type CatalogMatch = {
  entity_id: string;
  name: string;
  match_text: string;
  match_start: number;
  context_excerpt: string;
};

/**
 * Scan transcript for entity-name matches per the per-group rules.
 * Returns one hit per entity that matches (entities are not partially
 * matched — full-name regex). Each hit includes a context_excerpt
 * showing surrounding text for subscriber inspection.
 *
 * Cross-group matching is ADDITIVE — same transcript may yield hits
 * across multiple groups, and that's correct (the asset can be
 * legitimately described by descriptors from multiple groups).
 *
 * Caller is responsible for invoking once per group with that group's
 * entities.
 */
export function findCatalogMatches(
  transcript: string,
  group: TagGroup,
  entities: Array<{ id: string; name: string }>,
): CatalogMatch[] {
  const rules = AUTO_TAG_RULES[group];
  const matches: CatalogMatch[] = [];

  for (const entity of entities) {
    if (!entityNameEligibleForCatalogMatch(group, entity.name)) continue;

    const escapedName = entity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = rules.word_boundary_required
      ? new RegExp(`\\b${escapedName}\\b`, "i")
      : new RegExp(escapedName, "i");

    const match = transcript.match(pattern);
    if (match && match.index !== undefined) {
      const ctxStart = Math.max(0, match.index - 30);
      const ctxEnd = Math.min(
        transcript.length,
        match.index + match[0].length + 30,
      );
      const ctx = transcript.slice(ctxStart, ctxEnd).trim();
      const ellipsisStart = ctxStart > 0 ? "…" : "";
      const ellipsisEnd = ctxEnd < transcript.length ? "…" : "";

      matches.push({
        entity_id: entity.id,
        name: entity.name,
        match_text: match[0],
        match_start: match.index,
        context_excerpt: ellipsisStart + ctx + ellipsisEnd,
      });
    }
  }

  return matches;
}
