/**
 * Source-asset / template-variant architecture (per #162 + memo
 * project_tracpost_source_template_variants.md).
 *
 * Adds two tables:
 *   asset_templates — small reference catalog (~6 entries) describing
 *     each renderable template (aspect, duration, platform_eligibility,
 *     caption_style, audio_strategy).
 *   asset_variants — links source assets to their rendered template
 *     instances. UNIQUE(source_asset_id, template_id) enforces one
 *     variant per (source, template) combo.
 *
 * Per the architecture, each subscriber asset is a CANONICAL PARENT
 * (one row in media_assets), and variants are TEMPLATE-RENDERED
 * CHILDREN (rows in asset_variants). Six templates serve all 13
 * platforms via shared platform_eligibility arrays.
 *
 * Seeds the initial 6 templates so the orchestrator has something to
 * select against.
 *
 * Run: node scripts/migrate-100-asset-variants.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Creating asset_templates + asset_variants schema...");

  await sql`
    CREATE TABLE IF NOT EXISTS asset_templates (
      id              text PRIMARY KEY,
      label           text NOT NULL,
      aspect_ratio    text NOT NULL,
      duration_max_sec int NULL,
      platform_eligibility text[] NOT NULL,
      caption_style   jsonb,
      audio_strategy  text,
      description     text
    )
  `;
  console.log("  ✓ asset_templates table");

  await sql`
    CREATE TABLE IF NOT EXISTS asset_variants (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      template_id     text NOT NULL REFERENCES asset_templates(id),
      storage_url     text NOT NULL,
      render_settings jsonb,
      generated_at    timestamptz DEFAULT NOW(),
      last_used_at    timestamptz NULL,
      variant_status  text DEFAULT 'pending',
      quality_score   numeric NULL,
      metadata        jsonb DEFAULT '{}'::jsonb,
      UNIQUE(source_asset_id, template_id)
    )
  `;
  console.log("  ✓ asset_variants table");

  await sql`CREATE INDEX IF NOT EXISTS idx_variants_source ON asset_variants(source_asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_variants_template ON asset_variants(template_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_variants_template_status ON asset_variants(template_id, variant_status)`;
  console.log("  ✓ indexes");

  // Seed the six initial templates
  const templates = [
    {
      id: "reel_9x16",
      label: "Reel / Vertical Video",
      aspect_ratio: "9:16",
      duration_max_sec: 60,
      platform_eligibility: ["ig_reel", "tiktok", "yt_shorts", "fb_reel"],
      caption_style: { position: "overlay", style: "bold-subtitle" },
      audio_strategy: "embedded",
      description: "Vertical video for Reels-style placement. Serves IG Reels, TikTok, YouTube Shorts, FB Reels.",
    },
    {
      id: "feed_square",
      label: "Square Feed",
      aspect_ratio: "1:1",
      duration_max_sec: 60,
      platform_eligibility: ["ig_feed", "fb_feed"],
      caption_style: { position: "below" },
      audio_strategy: "embedded",
      description: "Square format for Instagram and Facebook Feed posts.",
    },
    {
      id: "feed_portrait",
      label: "Portrait Feed",
      aspect_ratio: "4:5",
      duration_max_sec: 60,
      platform_eligibility: ["ig_feed"],
      caption_style: { position: "below" },
      audio_strategy: "embedded",
      description: "Portrait 4:5 for Instagram Feed (taller post = more vertical real estate in feed).",
    },
    {
      id: "story_9x16",
      label: "Story",
      aspect_ratio: "9:16",
      duration_max_sec: 15,
      platform_eligibility: ["ig_story", "fb_story"],
      caption_style: { position: "overlay", style: "sticker" },
      audio_strategy: "embedded",
      description: "Vertical 9:16, max 15s. IG and FB Stories.",
    },
    {
      id: "pin_2x3",
      label: "Pinterest Pin",
      aspect_ratio: "2:3",
      duration_max_sec: null,
      platform_eligibility: ["pinterest"],
      caption_style: { position: "below", style: "title-banner" },
      audio_strategy: "mute",
      description: "2:3 vertical pin format for Pinterest. Stills only; audio not supported on platform.",
    },
    {
      id: "long_16x9",
      label: "Long Video",
      aspect_ratio: "16:9",
      duration_max_sec: 480,
      platform_eligibility: ["youtube", "fb_video"],
      caption_style: { position: "below" },
      audio_strategy: "embedded",
      description: "Landscape 16:9 for YouTube long-form and Facebook video posts.",
    },
  ];

  for (const t of templates) {
    await sql`
      INSERT INTO asset_templates (id, label, aspect_ratio, duration_max_sec, platform_eligibility, caption_style, audio_strategy, description)
      VALUES (${t.id}, ${t.label}, ${t.aspect_ratio}, ${t.duration_max_sec}, ${t.platform_eligibility}, ${JSON.stringify(t.caption_style)}::jsonb, ${t.audio_strategy}, ${t.description})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        aspect_ratio = EXCLUDED.aspect_ratio,
        duration_max_sec = EXCLUDED.duration_max_sec,
        platform_eligibility = EXCLUDED.platform_eligibility,
        caption_style = EXCLUDED.caption_style,
        audio_strategy = EXCLUDED.audio_strategy,
        description = EXCLUDED.description
    `;
  }
  console.log(`  ✓ Seeded ${templates.length} templates`);

  console.log("");
  console.log("Migration 100 complete.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
