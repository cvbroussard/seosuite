/**
 * Project matcher — maps Stage 1 NER project candidates to the site's
 * projects catalog. Mirrors brand-match.ts pattern (proven via #215
 * Levenshtein fuzzy + slug fallback).
 *
 * The match path:
 *   1. For each NER project candidate, fuzzy-token-match (forward +
 *      reverse) against every catalog project. Longest catalog name
 *      wins (stabilizes when "Shadyside" and "Shadyside Parlor
 *      Restoration" both qualify — the more-specific catalog entry
 *      wins).
 *   2. Slug-equality fallback catches normalization edge cases.
 *   3. Unmatched NER candidates become suggested_new — subscriber/
 *      operator can promote them to the catalog via the existing
 *      project-creation UI.
 *
 * Same NER-only philosophy as brand-match: vision-based project
 * inference is too easy to hallucinate. Projects only land on assets
 * when the subscriber actually named one in the transcript.
 */
import "server-only";
import { sql } from "@/lib/db";
import { tokenizeEntityName, findFuzzyTokenSpan } from "@/lib/auto-tag-rules";

export interface NerProjectCandidate {
  /** Surface form as extracted by NER (e.g. "Shadyside Parlor Restoration"). */
  name: string;
  /** Sentence-level excerpt for evidence display. */
  context?: string;
}

export interface ProjectCatalogMatch {
  project_id: string;
  /** Catalog name (canonical). */
  name: string;
  /** Catalog slug — useful for downstream link composition. */
  slug: string;
  /** What NER said before matching to the catalog. */
  ner_text: string;
  context: string;
}

export interface SuggestedNewProject {
  name: string;
  slug: string;
  context: string;
}

export interface ProjectMatchResult {
  matched: ProjectCatalogMatch[];
  suggested_new: SuggestedNewProject[];
}

function slugifyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export async function matchProjectsFromNer(
  siteId: string,
  nerProjects: NerProjectCandidate[],
): Promise<ProjectMatchResult> {
  const matched: ProjectCatalogMatch[] = [];
  const suggested_new: SuggestedNewProject[] = [];
  if (nerProjects.length === 0) return { matched, suggested_new };

  const projectRows = await sql`
    SELECT id, name, slug FROM projects WHERE site_id = ${siteId}
  `;
  const catalogIndex = projectRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    tokens: tokenizeEntityName(r.name as string),
  }));

  const claimedProjectIds = new Set<string>();
  const seenSuggestedLower = new Set<string>();

  for (const ner of nerProjects) {
    const candidateTokens = tokenizeEntityName(ner.name).map((word, i) => ({
      word,
      start: i,
      end: i + 1,
    }));

    // Forward + reverse fuzzy-token match. Longest catalog name wins —
    // when "Shadyside" matches both "Shadyside" and "Shadyside Parlor
    // Restoration", the more specific entry is the correct binding.
    let best: { id: string; name: string; slug: string; matchLen: number } | null = null;
    for (const entry of catalogIndex) {
      if (entry.tokens.length === 0) continue;
      const forward = findFuzzyTokenSpan(candidateTokens, entry.tokens);
      const candidateAsTokens = candidateTokens.map((t) => t.word);
      const reverseHaystack = entry.tokens.map((word, i) => ({
        word,
        start: i,
        end: i + 1,
      }));
      const reverse = findFuzzyTokenSpan(reverseHaystack, candidateAsTokens);
      if (forward || reverse) {
        const matchLen = entry.tokens.join(" ").length;
        if (!best || matchLen > best.matchLen) {
          best = { id: entry.id, name: entry.name, slug: entry.slug, matchLen };
        }
      }
    }

    if (best) {
      if (!claimedProjectIds.has(best.id)) {
        matched.push({
          project_id: best.id,
          name: best.name,
          slug: best.slug,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedProjectIds.add(best.id);
      }
      continue;
    }

    // Slug-equality fallback (whitespace/punctuation drift the fuzzy
    // matcher wouldn't catch).
    const slug = slugifyName(ner.name);
    const slugHit = catalogIndex.find((e) => slugifyName(e.name) === slug);
    if (slugHit) {
      if (!claimedProjectIds.has(slugHit.id)) {
        matched.push({
          project_id: slugHit.id,
          name: slugHit.name,
          slug: slugHit.slug,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedProjectIds.add(slugHit.id);
      }
      continue;
    }

    // No catalog hit → suggest as new project. Dedup by lowercase name.
    const lower = ner.name.toLowerCase();
    if (seenSuggestedLower.has(lower)) continue;
    seenSuggestedLower.add(lower);
    suggested_new.push({
      name: ner.name,
      slug,
      context: ner.context || "",
    });
  }

  return { matched, suggested_new };
}
