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
  /** Keyword cue parser may surface new-entity candidates when subscriber
   *  uses a group-specific cue word ('project', 'service', etc.) near a
   *  capitalized name in the transcript. See keyword_cue_creation memory. */
  allow_keyword_create_new: boolean;
  /** Group-specific keyword vocabulary for the cue parser. Lowercase. */
  keyword_cues: string[];
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
    allow_keyword_create_new: true,
    keyword_cues: ["brand"],
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
    allow_keyword_create_new: true,
    keyword_cues: ["service"],
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
    allow_keyword_create_new: true,
    keyword_cues: ["project"],
  },
  persona: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Privacy-excluded — NER never surfaces person mentions.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    // Keyword-cue creation IS allowed for personas — explicit subscriber
    // intent ("our client Mary Jones") satisfies the privacy concern
    // that motivated NER exclusion (subscriber is naming this person on
    // purpose; consent capture happens at confirmation step).
    allow_keyword_create_new: true,
    keyword_cues: ["client", "customer"],
  },
  branch: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Operator-managed structural units; not extractable from world knowledge.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    allow_keyword_create_new: true,
    keyword_cues: ["branch", "location", "office", "store"],
  },
  service_area: {
    min_match_chars: 4,
    min_match_words: 1,
    word_boundary_required: true,
    // Existing site overlay matches are unambiguous (subscriber
    // already chose which canonical to link).
    allow_auto_link_existing: true,
    // NER place extraction stays disabled (Point Breeze cross-
    // canonical ambiguity). Keyword cue path works because subscriber
    // explicit + geocoding-on-create resolves geographic ambiguity.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    allow_keyword_create_new: true,
    keyword_cues: ["area", "neighborhood"],
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

export type KeywordCueCandidate = {
  /** Extracted name (run of capitalized words preceding the keyword). */
  name: string;
  /** The keyword that triggered extraction (e.g., "project"). */
  keyword: string;
  /** Group this candidate belongs to. */
  group: TagGroup;
  /** Surrounding transcript context for subscriber inspection. */
  context_excerpt: string;
};

/**
 * Walk backward from a keyword position to capture the run of
 * capitalized words that names the entity. Stops at lowercase
 * stop-word, sentence boundary, or no-capital-found.
 *
 * Per feedback_auto_tag_imperfection_tolerance.md: edge cases get
 * manual fallback. Don't try to handle every variant.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "our", "my", "your", "this", "that", "these", "those",
  "in", "on", "at", "for", "with", "from", "to", "of", "and", "or", "but",
  "amazing", "beautiful", "stunning", "incredible", "great", "awesome",
  "is", "was", "were", "are", "be", "been", "being",
  "completed", "finished", "ongoing", "active",
]);

function capitalizedRunBefore(words: string[], endIdx: number): string[] {
  const captured: string[] = [];
  for (let i = endIdx - 1; i >= 0; i--) {
    const w = words[i];
    const stripped = w.replace(/[^\w'-]/g, "");
    if (!stripped) break;
    if (STOP_WORDS.has(stripped.toLowerCase())) break;
    // Capitalized = first letter uppercase. Allow numbers/hyphens within.
    const firstCharUpper = /^[A-Z]/.test(stripped);
    if (!firstCharUpper) break;
    captured.unshift(stripped);
  }
  return captured;
}

/**
 * Scan transcript for keyword-cue patterns. Returns candidates of the
 * form `<capitalized name> <keyword>` for the given group.
 *
 * Example: "the Gibson Family Condo Transformation project" with
 * keyword "project" → candidate { name: "Gibson Family Condo
 * Transformation", keyword: "project", group: "project" }
 */
export function findKeywordCues(
  transcript: string,
  group: TagGroup,
  /** Optional per-site override of the keyword vocabulary. If provided
   *  and non-empty, REPLACES the default keyword_cues for this group.
   *  Sourced from sites.tag_group_config JSONB. */
  overrideCues?: string[],
): KeywordCueCandidate[] {
  const rules = AUTO_TAG_RULES[group];
  if (!rules.allow_keyword_create_new) return [];
  const cues = (overrideCues && overrideCues.length > 0)
    ? overrideCues.map((c) => c.toLowerCase().trim()).filter(Boolean)
    : rules.keyword_cues;
  if (cues.length === 0) return [];

  const candidates: KeywordCueCandidate[] = [];
  const seenNames = new Set<string>();

  // Tokenize on whitespace, preserve punctuation in tokens for boundary
  // detection. Track absolute char positions for context excerpts.
  const words = transcript.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Strip trailing punctuation for keyword comparison
    const wLower = w.toLowerCase().replace(/[^\w]/g, "");
    if (!cues.includes(wLower)) continue;

    const nameWords = capitalizedRunBefore(words, i);
    if (nameWords.length === 0) continue;

    const name = nameWords.join(" ");
    // Apply same min_match_chars/words rules as catalog scan
    if (name.length < rules.min_match_chars) continue;
    if (nameWords.length < rules.min_match_words) continue;

    if (seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());

    // Build context excerpt — ~30 chars before name to ~30 chars after keyword
    const startWordIdx = Math.max(0, i - nameWords.length - 3);
    const endWordIdx = Math.min(words.length, i + 4);
    const context = words.slice(startWordIdx, endWordIdx).join(" ");

    candidates.push({
      name,
      keyword: wLower,
      group,
      context_excerpt: context,
    });
  }

  return candidates;
}
