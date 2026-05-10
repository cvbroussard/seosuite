import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Named Entity Recognition for transcript-driven auto-tagging.
 *
 * Per the seed_and_enrich_principle (LOCKED 2026-05-10) and the
 * auto_tagging_audit (LOCKED 2026-05-10): NER is the seed step for
 * the brands and service_areas auto-tagging pipelines.
 *
 * Uses Claude Sonnet because proper-noun precision matters and the
 * cost is trivial (~$0.003 per ~500-char transcript). Per the audit,
 * NER quality is the gate for the entire audio-first vision — bad
 * NER (false positives, missed mentions) degrades trust fast and
 * forces subscribers back to text-fallback.
 *
 * IMPORTANT (privacy policy): people names are NEVER extracted. Per
 * the auto-tagging audit, personas should never be auto-tagged from
 * transcripts. Face detection is the right path, gated by operator
 * review. This function intentionally does not return a `people` field.
 */

const anthropic = new Anthropic();

export interface ExtractedEntity {
  /** The literal name as it appeared (or normalized form). */
  name: string;
  /** ~5-10 words around the mention for context. */
  context: string;
}

export interface NerResult {
  /** Companies, suppliers, products with their own brand identity. */
  brands: ExtractedEntity[];
  /** Cities, neighborhoods, regions, ZIPs — geographic places. */
  places: ExtractedEntity[];
  /** Audit trail. */
  provider: string;
  /** Whisper sometimes mishears proper nouns; this hints at confidence. */
  warnings?: string[];
}

/**
 * Extract entity mentions from a transcript.
 *
 * Returns brands and places only. People are intentionally excluded
 * for privacy reasons (see seed_and_enrich_principle).
 */
export async function extractEntities(transcript: string, businessCategory?: string): Promise<NerResult> {
  const text = (transcript || "").trim();
  if (!text || text.length < 5) {
    return { brands: [], places: [], provider: "noop" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot extract entities");
  }

  const categoryHint = businessCategory
    ? `\n\nBusiness category for context: ${businessCategory}\n(Use this to disambiguate — e.g., "Brizo" in a kitchen-remodel context is the faucet brand, not a person's name)`
    : "";

  const prompt = `Extract named entity mentions from this transcript. The transcript is a subscriber speaking about a media asset (photo or video) for their business.${categoryHint}

Transcript:
"""
${text}
"""

Return ONLY valid JSON in this exact shape:
{
  "brands": [
    {"name": "Brizo", "context": "we used the Brizo Litze in matte black"}
  ],
  "places": [
    {"name": "Pasadena", "context": "for our Pasadena kitchen client"}
  ],
  "warnings": []
}

Strict rules:
1. ONLY extract entities mentioned by NAME — capitalized proper nouns
2. Brands = companies, suppliers, product lines, material brands (Brizo, Lacanche, Calacatta, Crystal Cabinet Works, Carrara, Thermador). Skip generic terms (the kitchen, the cabinets).
3. Places = cities, neighborhoods, ZIP codes, regions (Pasadena, Burbank, "the Westside", 91103). Be conservative — skip ambiguous words that could be common nouns (don't extract "the kitchen" as a place).
4. NEVER extract people names. If subscriber says "Mary loved it", do NOT include "Mary" anywhere in the response. This is a privacy policy.
5. Skip Whisper-likely-mistakes — if a word looks like it might be a transcription error of a known brand, add a warning instead of extracting (e.g., "le conch" — likely L'Atelier or similar; add to warnings).
6. Normalize brand names to canonical case if confident (e.g., "brizo" → "Brizo")
7. Deduplicate — if the same brand appears 3 times, return ONE entry with the most informative context.
8. Empty arrays are valid — return empty if nothing matches the strict rules.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      brands?: ExtractedEntity[];
      places?: ExtractedEntity[];
      warnings?: string[];
    };
    return {
      brands: Array.isArray(parsed.brands) ? parsed.brands.filter((b) => b?.name) : [],
      places: Array.isArray(parsed.places) ? parsed.places.filter((p) => p?.name) : [],
      provider: "claude-sonnet-4-6",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : undefined,
    };
  } catch {
    // Defensive: if JSON parse fails, return empty rather than throw
    return { brands: [], places: [], provider: "claude-sonnet-4-6", warnings: ["NER response not valid JSON"] };
  }
}
