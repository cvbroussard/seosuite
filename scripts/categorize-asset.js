#!/usr/bin/env node
/**
 * Operator smoke test: run the multimodal categorizer against a single
 * asset and print the result with full reasoning. Does NOT persist —
 * read-only dry run for accuracy validation during development.
 *
 * Use case: brief 3-5 of B²'s (or any subscriber's) assets manually,
 * then run this script on each. Inspect primary/secondary assignment
 * + confidence + reasoning. Tune confidence threshold or prompt before
 * any wider rollout.
 *
 * Per project_tracpost_categorization_workflow memory: NO bulk
 * backfill against un-briefed assets. This script is for organic
 * single-asset validation during development.
 *
 * Usage:
 *   node scripts/categorize-asset.js <asset_id>
 *
 * Cost: ~$0.02 per call (Claude Sonnet 4.6 with vision).
 */
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config({ path: ".env.local" });

const ASSET_ID = process.argv[2];
if (!ASSET_ID) {
  console.error("Usage: node scripts/categorize-asset.js <asset_id>");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

const SYSTEM_PROMPT = `You are TracPost's multimodal asset categorizer. Given an asset (image) + its transcript + a fixed list of GBP categories the site has declared, classify the asset into exactly one primary category and (rarely) up to 2 secondary categories.

CRITICAL RULES:

1. **NEVER INVENT GCIDS.** Only return gcids that appear in the site's category list. If no category fits well, pick the closest one and lower confidence.

2. **TRANSCRIPT IS THE STRONGEST SIGNAL.** Image gives visual context; transcript tells you what's actually happening. When they conflict, weight transcript higher.

3. **PRIMARY IS MANDATORY.** Always return exactly one primary — the single best match.

4. **SECONDARIES ARE RARE.** Only return secondaries (up to 2) when confidence ≥ 0.85 AND the asset genuinely spans multiple categories. Target distribution: ~90% single-tagged, ~10% multi-tagged.

5. **CONFIDENCE CALIBRATION:**
   - 0.95+ = transcript explicitly names + image clearly supports
   - 0.85-0.95 = transcript strongly implies + image supports
   - 0.7-0.85 = image clear + transcript adjacent
   - 0.5-0.7 = image only signal
   - <0.5 = essentially guessing

6. **REASONING CITES EVIDENCE.** Every category needs reasoning that quotes transcript + describes image.

7. **RANK BY FIT, NOT BY POPULARITY.** Prefer the most specific category that genuinely applies.

OUTPUT: Return ONLY a JSON object:
{ "primary": {gcid, confidence, reasoning}, "secondaries": [...], "allRanked": [...] }

Include all site categories in allRanked sorted by confidence descending.`;

async function fetchImageBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  let mediaType = "image/jpeg";
  if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("gif")) mediaType = "image/gif";
  else if (contentType.includes("webp")) mediaType = "image/webp";
  return { data: buf.toString("base64"), mediaType };
}

async function run() {
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id, context_note
    FROM media_assets WHERE id = ${ASSET_ID}
  `;
  if (!asset) { console.error("Asset not found"); process.exit(1); }
  console.log(`Asset: ${asset.id} (${asset.media_type})\n`);

  // Resolve image URL
  let imageUrl = asset.storage_url;
  if (asset.media_type === "video" && asset.poster_asset_id) {
    const [poster] = await sql`SELECT storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}`;
    imageUrl = poster?.storage_url || imageUrl;
  }
  if (!imageUrl) { console.error("No image URL for asset"); process.exit(1); }

  // Transcript: prefer recordings.transcript, fall back to context_note
  const [rec] = await sql`
    SELECT transcript FROM recordings
    WHERE source_asset_id = ${ASSET_ID} AND transcript IS NOT NULL AND transcript <> '' AND archived_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  const transcript = rec?.transcript || asset.context_note;
  if (!transcript || !transcript.trim()) {
    console.error("NO TRANSCRIPT — categorizer refuses to run (per workflow contract).");
    console.error("Brief this asset first (record + transcribe, or add a context note).");
    process.exit(1);
  }
  console.log(`Transcript (${transcript.length} chars):`);
  console.log(`  "${transcript.slice(0, 200)}${transcript.length > 200 ? "…" : ""}"\n`);

  // Site categories
  const cats = await sql`
    SELECT sgc.gcid, gc.name
    FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${asset.site_id}
    ORDER BY sgc.is_primary DESC, gc.name
  `;
  if (cats.length === 0) { console.error("No categories declared for site"); process.exit(1); }
  console.log(`Site categories (${cats.length}):`);
  cats.forEach((c) => console.log(`  ${c.gcid}  →  ${c.name}`));
  console.log();

  console.log(`Fetching image + firing Sonnet vision call (~$0.02)...\n`);
  const { data, mediaType } = await fetchImageBase64(imageUrl);

  const userMessage =
    `=== ASSET TRANSCRIPT ===\n${transcript}\n\n` +
    `=== SITE'S DECLARED GBP CATEGORIES (pick ONLY from these) ===\n` +
    cats.map((c) => `  ${c.gcid}  →  ${c.name}`).join("\n") +
    `\n\n=== ASK ===\nClassify the asset shown in the image, using the transcript as primary signal. Return the JSON object per the system prompt.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: userMessage },
        ],
      },
    ],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("LLM returned no JSON object");
    console.error("Raw response:", text.slice(0, 500));
    process.exit(1);
  }
  const parsed = JSON.parse(match[0]);

  console.log(`=== CATEGORIZATION RESULT ===\n`);
  const validGcids = new Set(cats.map((c) => c.gcid));
  const nameByGcid = new Map(cats.map((c) => [c.gcid, c.name]));

  if (!validGcids.has(parsed.primary.gcid)) {
    console.warn(`⚠ Primary gcid not in site catalog: ${parsed.primary.gcid}\n`);
  }
  const confBars = (c) => "▓".repeat(Math.round(c * 10)) + "░".repeat(10 - Math.round(c * 10));

  console.log(`★ PRIMARY: ${nameByGcid.get(parsed.primary.gcid) || parsed.primary.gcid}  [${parsed.primary.gcid}]`);
  console.log(`  confidence: ${confBars(parsed.primary.confidence)} ${(parsed.primary.confidence * 100).toFixed(0)}%`);
  console.log(`  reasoning: ${parsed.primary.reasoning}\n`);

  const sec = (parsed.secondaries || []).filter((s) => validGcids.has(s.gcid) && s.confidence >= 0.85).slice(0, 2);
  if (sec.length > 0) {
    console.log(`SECONDARIES (${sec.length}, threshold ≥0.85):`);
    sec.forEach((s) => {
      console.log(`  ${nameByGcid.get(s.gcid) || s.gcid}  [${s.gcid}]`);
      console.log(`  confidence: ${confBars(s.confidence)} ${(s.confidence * 100).toFixed(0)}%`);
      console.log(`  reasoning: ${s.reasoning}\n`);
    });
  } else {
    console.log(`(no secondaries — single-tagged is the dominant case)\n`);
  }

  console.log(`=== FULL RANKING (all ${parsed.allRanked.length} categories) ===\n`);
  (parsed.allRanked || []).sort((a, b) => b.confidence - a.confidence).forEach((r) => {
    const mark = r.gcid === parsed.primary.gcid ? "★" : sec.some((s) => s.gcid === r.gcid) ? "•" : " ";
    console.log(`  ${mark} ${(nameByGcid.get(r.gcid) || r.gcid).padEnd(35)} ${confBars(r.confidence)} ${(r.confidence * 100).toFixed(0)}%`);
  });
  console.log();
  console.log(`Cost: input ${res.usage.input_tokens} tok + output ${res.usage.output_tokens} tok`);
  console.log(`(DRY RUN — not persisted to asset_categories. Use process-briefed-asset.ts integration to persist live.)`);
}

run().catch((err) => { console.error(err); process.exit(1); });
