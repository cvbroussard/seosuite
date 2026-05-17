/**
 * Whisper prompt builder — site-aware vocabulary priming.
 *
 * OpenAI Whisper accepts a `prompt` parameter (≤224 tokens) that biases
 * recognition toward specific vocabulary. Without it, proper nouns like
 * brand names, project names, and neighborhood names get rewritten to
 * their nearest common-English neighbor — "Infratech" becomes "infra
 * tech", which kills downstream NER + matcher attribution.
 *
 * For each site we pack the catalog vocabulary that's most likely to
 * appear in subscriber narration:
 *   - Brand names (highest priority — the most common fail point)
 *   - Project names (subscriber-specific, never in Whisper's training)
 *   - GBP service areas (smaller neighborhoods often mis-heard)
 *   - GBP categories (occupational jargon)
 *   - Personas (subscriber + operator names)
 *
 * Budget: ~1000 chars (~200 tokens). Brands and projects get priority.
 * If a site has more catalog than fits, we truncate at a name boundary
 * after brands/projects, since those are the highest-value entries.
 *
 * Per project_tracpost_asset_analysis_cascade — STT is the ceiling for
 * the whole cascade. This is the cheap first-move on STT quality before
 * the provider bake-off (#152) re-evaluates Whisper vs Deepgram/AssemblyAI.
 */
import "server-only";
import { sql } from "@/lib/db";

/** Whisper hard limit on the prompt parameter. We aim well under to
 * leave room for the leading framing phrase + comma separators. */
const PROMPT_CHAR_BUDGET = 1000;

/** Returns a Whisper prompt biased toward the site's catalog
 * vocabulary, or empty string when the site has no catalog yet
 * (Whisper handles an empty prompt fine — it just runs unbiased). */
export async function buildWhisperPromptForSite(siteId: string): Promise<string> {
  if (!siteId) return "";

  const [brandRows, projectRows, siteRow, categoryRows, personaRows] = await Promise.all([
    sql`SELECT name FROM brands WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT name FROM projects WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
        FROM sites WHERE id = ${siteId}`,
    sql`SELECT gc.name FROM site_gbp_categories sgc
        JOIN gbp_categories gc ON gc.gcid = sgc.gcid
        WHERE sgc.site_id = ${siteId}
        ORDER BY sgc.is_primary DESC, gc.name`,
    sql`SELECT name FROM personas WHERE site_id = ${siteId}`,
  ]);

  const brands = brandRows.map((r) => r.name as string).filter(Boolean);
  const projects = projectRows.map((r) => r.name as string).filter(Boolean);
  const placeInfos = (siteRow[0]?.place_infos || []) as Array<{ placeName?: string }>;
  // GBP placeName arrives full-formatted ("Shadyside, Pittsburgh, PA, USA").
  // For Whisper's purposes, the short form is what we need to bias toward.
  const serviceAreas = placeInfos
    .map((p) => (p.placeName || "").split(",")[0]?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));
  const categories = categoryRows.map((r) => r.name as string).filter(Boolean);
  const personas = personaRows.map((r) => r.name as string).filter(Boolean);

  // Priority order — brands first (highest fail rate), then projects,
  // then geographic, then occupational, then personas. Whisper weights
  // toward whatever appears in the prompt regardless of position, but
  // we truncate at the budget boundary so earlier groups are safer.
  const ordered = [...brands, ...projects, ...serviceAreas, ...categories, ...personas];

  // Dedupe (some names may overlap across groups — e.g. a project named
  // after a neighborhood) while preserving first-occurrence order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of ordered) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  if (unique.length === 0) return "";

  // Build the prompt with a brief framing phrase. OpenAI's docs note
  // that prompts work best when they look like a natural snippet of
  // the kind of audio Whisper is about to transcribe — but for pure
  // vocabulary biasing, a "may include" preamble works well in practice.
  const preamble = "Speaker may reference: ";
  let prompt = preamble;
  for (const name of unique) {
    const next = prompt.length === preamble.length ? name : `, ${name}`;
    if (prompt.length + next.length > PROMPT_CHAR_BUDGET) break;
    prompt += next;
  }
  return prompt;
}
