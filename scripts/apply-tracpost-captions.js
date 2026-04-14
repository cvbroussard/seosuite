/**
 * One-off: apply hand-written context_notes to TracPost's screenshot set.
 *
 * The auto-captioner transcribes UI text, which reads as AI on screenshots.
 * These captions describe the MOMENT each screenshot captures, not the
 * visible UI elements. Upload the files via the studio (no Generate
 * caption click), then run this script to set context_note by matching
 * on each asset's metadata.original_filename.
 *
 * Usage: node scripts/apply-tracpost-captions.js <site_id> [--dry-run]
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

// filename substring → caption. Each substring must be unique within
// the asset set for this site, or the script will refuse to apply.
const CAPTIONS = {
  // ── Playbook shots ──
  "212207":
    "A fresh tenant starts here. The baseline playbook is already built — audience, positioning, voice, all researched from the business category alone. What's missing is the twist: the one thing that makes this business different from every other business in its category. Until that lands, the playbook is a well-researched generic.",

  "212044":
    "Epicurious Kitchens is a kitchen remodeler, but their playbook isn't about kitchen remodeling. Their angle — luxury kitchens for serious cooks — reshapes everything: the audience narrows to prosumer cooks and culinary professionals, the promise becomes \"the space you spend the most time in finally performs the way you do,\" and the voice is now knowledgeable, passionate, deeply fluent. One sentence of angle, an entire playbook rebuilt around it.",

  "211908":
    "B2 Construction's twist is operational, not emotional: they keep their crews in-house while every competitor subcontracts. That single structural difference reshapes the whole playbook. Positioning: The Complex Project Specialist. Tagline: we do the projects other contractors turn down. Voice: technically authoritative and quietly proud. The playbook didn't need five interviews — it needed one true sentence about what this business actually does differently.",

  "Brand_Intelligence":
    "A content automation platform, a luxury kitchen remodeler, a structural contractor. Three businesses with nothing in common — except the playbook. Same framework, different angle, each one ends up somewhere unmistakably its own. The shape travels; the voice doesn't.",

  // ── Published outputs (to upload) ──
  "b2home":
    "Scroll past the hero of B2 Construction's site and you land here: \"What We Actually Do,\" three service cards that read like the language of a contractor who's earned the right to say them — Complex Structural Renovation, Full-System Modernization, Pre-Construction Diagnostics. None of this copy was written by a consultant. It was derived from the sharpened playbook.",

  "b2_projects":
    "The project gallery opens on a line only B2 Construction would write: \"Projects Other Contractors Left Behind.\" Six jobs — brick rebuilds, grand kitchens, stone facades, historic exteriors — the kind of work that's the whole reason a homeowner calls a structural specialist instead of a finish carpenter. The portfolio isn't a template. It's their tagline, made visible.",

  "b2blog":
    "\"Radiant Heat From the Ground Up: How Rehau PEX and Creatherm Work Together in a Below-Grade Slab.\" A deeply technical post about pouring a heated slab, written in B2's voice: patient, exact, informed by actually doing the work. This is what the Complex Project Specialist's blog sounds like — not SEO filler, not contractor clickbait. Material-specific writing for the kind of homeowner who'll read it.",

  "ekblog":
    "Two articles side by side, both about the same thing in different light: where your hands go when you cook, and why a well-designed kitchen gets out of the way. \"Open the Drawer. Everything's Right There.\" \"Everything Exactly Where Your Hands Reach.\" These are not renovation posts. They're about what cooking feels like when the space was built for it. The playbook's angle — kitchens for serious cooks — shows up in the language before it shows up in the photos.",

  "ekarticle":
    "\"Three Pots Going and You're Not Thinking About the Kitchen.\" The article opens inside a moment: water boiling, a sauce reducing, a guest arriving, and the kitchen doing its job in the background because someone designed it to. This is what the playbook made possible — an article where the kitchen itself is a minor character and the cook's flow is the subject.",

  // ── Studio experience (to upload) ──
  "ekcalendar":
    "Fifty-eight drafts waiting for review. Every line is a post idea written in Epicurious Kitchens' voice, already tagged to a pillar, already matched to photos in the library. The subscriber's job isn't to fill a blank editor — it's to skim, approve, schedule. The content was never the bottleneck.",

  "ekmedia":
    "128 of 190 media assets, each one auto-tagged, quality-scored, and tied to the pillars the playbook cares about. Some are captioned. Some are tagged to specific entities (brands, people, rooms). The library isn't a folder of JPEGs — it's the raw material for everything the blog, the calendar, and the social feed will publish next week.",

  "ekstudioblog":
    "The studio view of the blog — every post the AI has drafted, ready for review. No blank page, no blinking cursor. The subscriber approves, tweaks, or rejects. Over time, their rejections teach the system what they don't sound like. The approvals teach it what they do.",

  "ekstudioconnections":
    "Seven platforms connected — Instagram, Facebook, LinkedIn, Pinterest, TikTok, YouTube, Twitter. Two tokens expired (they do that, quietly). The activity log on the right shows what actually went out: three blog posts published, two LinkedIn crossposts. The subscriber didn't schedule any of this. The autopilot did.",
};

async function main() {
  const siteId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!siteId) {
    console.error("Usage: node scripts/apply-tracpost-captions.js <site_id> [--dry-run]");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  const assets = await sql`
    SELECT id, storage_url, context_note, metadata
    FROM media_assets
    WHERE site_id = ${siteId}
    ORDER BY created_at ASC
  `;

  if (assets.length === 0) {
    console.error(`No media_assets found for site ${siteId}`);
    process.exit(1);
  }

  console.log(`Found ${assets.length} assets for site ${siteId}\n`);

  const matches = [];
  const unmatched = [];
  const ambiguous = [];
  const usedKeys = new Set();

  for (const asset of assets) {
    const filename =
      (asset.metadata || {}).original_filename ||
      asset.storage_url.split("/").pop()?.split("?")[0] ||
      "";
    const haystack = filename.toLowerCase();

    const hits = Object.keys(CAPTIONS).filter((k) => haystack.includes(k.toLowerCase()));

    if (hits.length === 0) {
      unmatched.push({ id: asset.id, filename });
    } else if (hits.length > 1) {
      ambiguous.push({ id: asset.id, filename, hits });
    } else {
      matches.push({
        id: asset.id,
        filename,
        key: hits[0],
        currentNote: asset.context_note,
      });
      usedKeys.add(hits[0]);
    }
  }

  const unusedKeys = Object.keys(CAPTIONS).filter((k) => !usedKeys.has(k));

  console.log(`Matches (${matches.length}):`);
  for (const m of matches) {
    const status = m.currentNote ? "(will overwrite)" : "(empty)";
    console.log(`  ${m.key.padEnd(20)}  →  ${m.filename}  ${status}`);
  }

  if (unmatched.length > 0) {
    console.log(`\nUnmatched assets (${unmatched.length}) — no caption key matched:`);
    for (const u of unmatched) console.log(`  ${u.filename}  (id: ${u.id})`);
  }

  if (ambiguous.length > 0) {
    console.log(`\nAmbiguous assets (${ambiguous.length}) — multiple caption keys matched:`);
    for (const a of ambiguous) console.log(`  ${a.filename}  →  ${a.hits.join(", ")}`);
    console.error("\nRefusing to apply — tighten your caption-key substrings so each matches one file.");
    process.exit(1);
  }

  if (unusedKeys.length > 0) {
    console.log(`\nUnused caption keys (${unusedKeys.length}) — no asset matched:`);
    for (const k of unusedKeys) console.log(`  ${k}`);
  }

  if (dryRun) {
    console.log("\n--dry-run set — no changes written.");
    return;
  }

  if (matches.length === 0) {
    console.log("\nNothing to apply.");
    return;
  }

  for (const m of matches) {
    await sql`
      UPDATE media_assets
      SET context_note = ${CAPTIONS[m.key]},
          metadata = (COALESCE(metadata, '{}'::jsonb) - 'context_auto_generated')
                     || '{"context_source":"manual"}'::jsonb
      WHERE id = ${m.id}
    `;
  }

  console.log(`\nApplied captions to ${matches.length} assets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
