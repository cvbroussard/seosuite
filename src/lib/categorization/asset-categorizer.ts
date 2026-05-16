/**
 * Multimodal asset categorizer.
 *
 * Takes an asset (image OR video poster) + its transcript + the site's
 * 10 declared GBP categories, returns a ranked classification with
 * confidence per category. The primary category is always assigned; up
 * to 2 secondaries only at confidence ≥0.85.
 *
 * Target distribution per project_tracpost_gbp_categories_coaching:
 *   ~90% single-tagged (primary only)
 *   ~10% multi-tagged (primary + 1-2 secondaries)
 *
 * Target accuracy: 95%+ correct primary assignment as judged by
 * operator manual validation.
 *
 * HARD CONTRACT — transcript required:
 *
 * Per project_tracpost_categorization_workflow memory, the categorizer
 * refuses to run without a transcript. Image-only categorization
 * produces systematically low-confidence results and would mislead
 * accuracy measurements. Returns { status: 'skipped', reason: 'no_transcript' }
 * — caller decides whether to log, retry later, or escalate.
 *
 * Trigger: fires at briefing-complete (process-briefed-asset.ts hook)
 * when the transcript is guaranteed present.
 *
 * Model choice: Claude Sonnet 4.6 with vision. Haiku's vision isn't
 * strong enough to hit the 95%+ accuracy target. Cost is ~$0.02/asset
 * (~3400 tokens), trivial against the deliverable quality.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { getAssetNarrative } from "@/lib/asset-narrative";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CategorizedTag {
  gcid: string;
  /** Display name from gbp_categories.name */
  name: string;
  /** 0..1 from the LLM */
  confidence: number;
  /** Why the LLM chose this category (cited evidence from image/transcript) */
  reasoning: string;
}

export interface CategorizationResult {
  /** The chosen primary category — exactly one, always assigned */
  primary: CategorizedTag;
  /** Up to 2 secondaries — only present when confidence ≥ 0.85 */
  secondaries: CategorizedTag[];
  /** All raw rankings the LLM produced (full digest, for inspector/debug) */
  allRanked: CategorizedTag[];
  /** Source signal used (for traceability) */
  signal: {
    narrativeSource: "recording" | "context_note";
    imageUrl: string;
    siteCategoryCount: number;
  };
}

export type CategorizeOutcome =
  | { status: "success"; result: CategorizationResult }
  | { status: "skipped"; reason: "no_transcript" | "no_site_categories" | "no_image" }
  | { status: "error"; error: string };

const SYSTEM_PROMPT = `You are TracPost's multimodal asset categorizer. Given an asset (image) + its transcript (operator/subscriber's spoken narration during briefing) + a fixed list of GBP categories the site has declared, classify the asset into exactly one primary category and (rarely) up to 2 secondary categories.

CRITICAL RULES:

1. **NEVER INVENT GCIDS.** Only return gcids that appear in the site's category list provided below. If no category fits well, pick the closest one and lower confidence — never make up a gcid.

2. **TRANSCRIPT IS THE STRONGEST SIGNAL.** Image gives visual context; transcript tells you what's actually happening. When they conflict, weight transcript higher. The operator narrated the moment for a reason.

3. **PRIMARY IS MANDATORY.** Always return exactly one primary — the single best match. Even if confidence is low, pick the best available option.

4. **SECONDARIES ARE RARE.** Only return secondaries (up to 2) when confidence ≥ 0.85 AND the asset genuinely spans multiple categories (e.g., a kitchen + bathroom in the same project shot). Target distribution: ~90% single-tagged, ~10% multi-tagged. If you're tempted to add a secondary at 0.6 confidence, don't.

5. **CONFIDENCE CALIBRATION:**
   - 0.95+ = transcript explicitly names the category type, image clearly supports it
   - 0.85-0.95 = transcript strongly implies + image supports
   - 0.7-0.85 = image clear + transcript adjacent (e.g., transcript talks about the client, image shows the work)
   - 0.5-0.7 = image only signal (transcript was off-topic or non-specific) — still returns a primary at this band
   - <0.5 = essentially guessing; primary still required, but low-confidence flags downstream review

6. **REASONING CITES EVIDENCE.** Every category in your output needs a reasoning field that quotes or paraphrases what in the transcript + what in the image drove the call. "Transcript mentions 'gut renovation of the master bath' and image shows tile + plumbing rough-in" — not "this is a bathroom."

7. **RANK BY FIT, NOT BY POPULARITY.** Don't bias toward broader categories just because they fit more things. Prefer the most specific category that genuinely applies.

OUTPUT: Return ONLY a JSON object with this shape. No prose, no markdown code fences.

{
  "primary": {
    "gcid": "gcid:foo",
    "confidence": 0.0-1.0,
    "reasoning": "Specific evidence citation."
  },
  "secondaries": [
    { "gcid": "gcid:bar", "confidence": 0.0-1.0, "reasoning": "..." }
  ],
  "allRanked": [
    { "gcid": "gcid:foo", "confidence": 0.95, "reasoning": "..." },
    { "gcid": "gcid:baz", "confidence": 0.40, "reasoning": "..." }
  ]
}

Include all 10 site categories in allRanked sorted by confidence descending — gives the inspector a full view of the LLM's reasoning across the option set.`;

interface AssetRecord {
  id: string;
  site_id: string;
  storage_url: string;
  media_type: string;
  poster_asset_id: string | null;
}

/**
 * Resolve the URL to use for the LLM image input. For images, that's
 * storage_url directly. For videos, we use the poster asset's
 * storage_url (every video upload gets a poster per the 2026-05-08
 * design lock).
 */
async function resolveImageUrl(asset: AssetRecord): Promise<string | null> {
  if (asset.media_type === "image") return asset.storage_url || null;
  if (asset.media_type === "video" && asset.poster_asset_id) {
    const [poster] = await sql`
      SELECT storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}
    `;
    return (poster?.storage_url as string) || null;
  }
  // Unknown media type — try storage_url as last resort
  return asset.storage_url || null;
}

/**
 * Fetch the image as base64 for inline submission to the LLM. We use
 * base64 (vs URL passthrough) so this works regardless of public-URL
 * accessibility from Anthropic's servers — storage_url could be
 * presigned R2, signed CDN, etc.
 */
async function fetchImageBase64(
  url: string,
): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("gif")) mediaType = "image/gif";
  else if (contentType.includes("webp")) mediaType = "image/webp";
  return { data: buf.toString("base64"), mediaType };
}

function buildUserMessage(
  transcript: string,
  siteCategories: Array<{ gcid: string; name: string }>,
): string {
  const lines: string[] = [];
  lines.push("=== ASSET TRANSCRIPT (briefing narration) ===\n");
  lines.push(transcript.trim());
  lines.push("");
  lines.push("=== SITE'S DECLARED GBP CATEGORIES (pick ONLY from these) ===\n");
  for (const c of siteCategories) {
    lines.push(`  ${c.gcid}  →  ${c.name}`);
  }
  lines.push("");
  lines.push("=== ASK ===\n");
  lines.push("Classify the asset shown in the image, using the transcript as primary signal.");
  lines.push("Return the JSON object per the system prompt.");
  return lines.join("\n");
}

export async function categorizeAsset(assetId: string): Promise<CategorizeOutcome> {
  // 1. Load asset row
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return { status: "error", error: `Asset ${assetId} not found` };

  // 2. Load site categories (the 10 declared via coaching or sync)
  const siteCategories = await sql`
    SELECT sgc.gcid, gc.name
    FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${asset.site_id}
    ORDER BY sgc.is_primary DESC, gc.name
  `;
  if (siteCategories.length === 0) {
    return { status: "skipped", reason: "no_site_categories" };
  }

  // 3. HARD CONTRACT — transcript required
  const narrative = await getAssetNarrative(assetId);
  if (narrative.source === "empty" || !narrative.text.trim()) {
    return { status: "skipped", reason: "no_transcript" };
  }

  // 4. Resolve image URL (poster for video, storage_url for image)
  const imageUrl = await resolveImageUrl(asset as AssetRecord);
  if (!imageUrl) return { status: "skipped", reason: "no_image" };

  try {
    // 5. Fetch image bytes
    const { data, mediaType } = await fetchImageBase64(imageUrl);

    // 6. LLM call — Sonnet 4.6 with vision
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data },
            },
            {
              type: "text",
              text: buildUserMessage(
                narrative.text,
                siteCategories as Array<{ gcid: string; name: string }>,
              ),
            },
          ],
        },
      ],
    });

    // 7. Parse output
    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned no JSON object");
    const parsed = JSON.parse(match[0]) as {
      primary: { gcid: string; confidence: number; reasoning: string };
      secondaries: Array<{ gcid: string; confidence: number; reasoning: string }>;
      allRanked: Array<{ gcid: string; confidence: number; reasoning: string }>;
    };

    // 8. Validate gcids against site catalog (anti-hallucination)
    const validGcids = new Set(siteCategories.map((c) => c.gcid as string));
    const nameByGcid = new Map(siteCategories.map((c) => [c.gcid as string, c.name as string]));
    if (!validGcids.has(parsed.primary.gcid)) {
      throw new Error(`LLM returned invalid primary gcid: ${parsed.primary.gcid}`);
    }
    const validSecondaries = (parsed.secondaries || [])
      .filter((s) => validGcids.has(s.gcid) && s.confidence >= 0.85)
      .slice(0, 2);
    const allRanked = (parsed.allRanked || []).filter((r) => validGcids.has(r.gcid));

    const enrich = (t: { gcid: string; confidence: number; reasoning: string }): CategorizedTag => ({
      gcid: t.gcid,
      name: nameByGcid.get(t.gcid) || t.gcid,
      confidence: t.confidence,
      reasoning: t.reasoning,
    });

    return {
      status: "success",
      result: {
        primary: enrich(parsed.primary),
        secondaries: validSecondaries.map(enrich),
        allRanked: allRanked.map(enrich),
        signal: {
          narrativeSource: narrative.source,
          imageUrl,
          siteCategoryCount: siteCategories.length,
        },
      },
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Persist a categorization result to asset_categories.
 *
 * Strategy: wipes existing 'auto' rows for the asset, leaves 'operator'
 * and 'subscriber' overrides alone. New 'auto' rows from this run are
 * inserted. If an operator-set primary exists, the new auto primary
 * gets is_primary=false to respect the override.
 */
export async function persistCategorization(
  assetId: string,
  result: CategorizationResult,
): Promise<{ inserted: number; preservedOverrides: number }> {
  // Capture any operator/subscriber overrides we must not clobber
  const overrides = await sql`
    SELECT gcid, is_primary FROM asset_categories
    WHERE asset_id = ${assetId} AND assigned_by != 'auto'
  `;
  const overrideGcids = new Set(overrides.map((r) => r.gcid as string));
  const hasOverridePrimary = overrides.some((r) => r.is_primary === true);

  // Wipe auto rows only
  await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND assigned_by = 'auto'`;

  // Insert primary + secondaries (skip any gcid the operator already
  // owns — their row already covers it). If operator already designated
  // a primary, the auto primary gets is_primary=false to defer.
  const toInsert: Array<{ gcid: string; isPrimary: boolean; tag: CategorizedTag }> = [];
  if (!overrideGcids.has(result.primary.gcid)) {
    toInsert.push({
      gcid: result.primary.gcid,
      isPrimary: !hasOverridePrimary,
      tag: result.primary,
    });
  }
  for (const s of result.secondaries) {
    if (overrideGcids.has(s.gcid)) continue;
    toInsert.push({ gcid: s.gcid, isPrimary: false, tag: s });
  }

  for (const item of toInsert) {
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${item.gcid}, ${item.isPrimary}, ${item.tag.confidence}, 'auto', ${item.tag.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
  }

  return { inserted: toInsert.length, preservedOverrides: overrides.length };
}
