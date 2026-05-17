/**
 * OpenAI STT prompt builder — site-aware vocabulary + instructions.
 *
 * gpt-4o-transcribe (our default model as of 2026-05-18) accepts the
 * `prompt` parameter as natural-language instructions, not just a
 * vocabulary list. We use that capability to:
 *   1. Frame the audio domain (construction industry narration)
 *   2. Surface known proper nouns from the site catalog so the model
 *      treats them as coherent tokens (the Infratech → "Infratec"
 *      failure mode)
 *   3. Dictate output formatting (digits for years, preserve caps)
 *
 * The same prompt is also accepted by whisper-1 (fallback path for
 * voice-over recordings that need time-anchored segments). whisper-1
 * uses it as vocabulary biasing only — it ignores the instruction
 * sentences. Either way the prompt is useful; nothing breaks if we
 * route to whisper-1.
 *
 * Per project_tracpost_asset_analysis_cascade — STT is the ceiling
 * for the whole cascade.
 */
import "server-only";
import { sql } from "@/lib/db";

/** Soft budget. Both gpt-4o-transcribe and whisper-1 accept longer
 * prompts than this, but we stay tight to keep the model focused on
 * the instruction rather than drowning in catalog. */
const PROMPT_CHAR_BUDGET = 1500;

/** Returns an OpenAI STT prompt biased toward the site's catalog
 * vocabulary, or empty string when the site has no catalog yet. */
export async function buildTranscriptionPromptForSite(siteId: string): Promise<string> {
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
  const serviceAreas = placeInfos
    .map((p) => (p.placeName || "").split(",")[0]?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));
  const categories = categoryRows.map((r) => r.name as string).filter(Boolean);
  const personas = personaRows.map((r) => r.name as string).filter(Boolean);

  // Dedupe across groups (project might be named after a neighborhood).
  const seen = new Set<string>();
  function add(into: string[], from: string[]) {
    for (const name of from) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      into.push(name);
    }
  }
  const brandsList: string[] = [];
  const projectsList: string[] = [];
  const placesList: string[] = [];
  const categoriesList: string[] = [];
  const personasList: string[] = [];
  add(brandsList, brands);
  add(projectsList, projects);
  add(placesList, serviceAreas);
  add(categoriesList, categories);
  add(personasList, personas);

  if (brandsList.length + projectsList.length + placesList.length +
      categoriesList.length + personasList.length === 0) {
    return "";
  }

  // Instruction block — gpt-4o-transcribe reads this as actual
  // guidance, not just vocabulary. whisper-1 ignores the prose and
  // uses the proper nouns as biasing tokens. Either way useful.
  const sections: string[] = [
    "This is a construction industry recording. The speaker is a contractor narrating project work.",
    "Preserve proper noun capitalization. Treat compound product names (e.g. Infratech, Limewash, Azek) as single proper nouns.",
    "Format numerals as digits (1926, not nineteen twenty-six). Use natural punctuation and paragraph breaks.",
    "Known proper nouns that may appear in this recording:",
  ];

  if (brandsList.length > 0) sections.push(`Brands: ${brandsList.join(", ")}`);
  if (projectsList.length > 0) sections.push(`Projects: ${projectsList.join(", ")}`);
  if (placesList.length > 0) sections.push(`Places: ${placesList.join(", ")}`);
  if (categoriesList.length > 0) sections.push(`Services: ${categoriesList.join(", ")}`);
  if (personasList.length > 0) sections.push(`People: ${personasList.join(", ")}`);

  let prompt = sections.join("\n");
  if (prompt.length > PROMPT_CHAR_BUDGET) {
    prompt = prompt.slice(0, PROMPT_CHAR_BUDGET).replace(/,[^,]*$/, "");
  }
  return prompt;
}

// Back-compat alias — existing callers may still import the old name.
// New code should use buildTranscriptionPromptForSite directly.
export const buildWhisperPromptForSite = buildTranscriptionPromptForSite;
