/**
 * Migration 090: post_templates registry + social_posts template/content_type fields.
 *
 * Phase 1 of the publish-module refactor (task #82). Additive only — no
 * destructive changes. Existing publishing pipeline continues working
 * unchanged. New fields are optional / nullable on existing rows.
 *
 * Why this is distinct from existing render_templates (migration 038):
 *   - render_templates → defines HOW assets are visually rendered
 *     (crop, grade, text overlays, watermark)
 *   - post_templates  → defines the publishing FORMAT/SHAPE — what slot
 *     configuration the platform expects (asset count, allowed media
 *     types, aspect ratios, required metadata fields, target API endpoint)
 *
 * The Compose UI (Phase 2) reads from post_templates to build the
 * template picker dropdown ("FB Single Image", "IG Reel", "Pinterest
 * Tall Pin", etc.). Each post template encapsulates the platform
 * decision; the subscriber doesn't pick "platform" then "format" —
 * they pick a template, which carries both.
 *
 * Schema additions:
 *   - NEW table: post_templates (operator-curated registry)
 *   - social_posts.template_id (UUID, nullable, FK to post_templates)
 *   - social_posts.content_type (TEXT, default 'post' — 'post' | 'article' | future)
 *
 * Seeded templates: 9 MVP templates covering the core platforms.
 * Additional templates can be added via operator UI (future) or by
 * re-running this script with new entries (idempotent — uses ON CONFLICT
 * on (platform, format)).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const TEMPLATES = [
  // ── Facebook ──────────────────────────────────────────────
  {
    platform: "facebook",
    format: "single_image",
    name: "Facebook Single Image",
    description: "Standard photo post to a Facebook Page. The most common Facebook publishing format.",
    asset_slots: { count: 1, allowed_types: ["image"], aspect_ratios: ["1:1", "4:5", "16:9"], duration_max_sec: null },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true },
    api_endpoint: "POST /{page_id}/photos",
    sort_order: 10,
  },
  {
    platform: "facebook",
    format: "carousel",
    name: "Facebook Multi-Photo Carousel",
    description: "Up to 10 photos in a swipeable carousel. Great for transformation reveals (before/mid/after).",
    asset_slots: { count_min: 2, count_max: 10, allowed_types: ["image"], aspect_ratios: ["1:1", "4:5"], duration_max_sec: null },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true, per_slide_caption: true },
    api_endpoint: "POST /{page_id}/feed (multi-attached)",
    sort_order: 20,
  },
  {
    platform: "facebook",
    format: "video",
    name: "Facebook Single Video",
    description: "Video post to a Facebook Page. Supports landscape, square, and vertical formats.",
    asset_slots: { count: 1, allowed_types: ["video"], aspect_ratios: ["1:1", "4:5", "16:9", "9:16"], duration_max_sec: 240 },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true },
    api_endpoint: "POST /{page_id}/videos",
    sort_order: 30,
  },
  {
    platform: "facebook",
    format: "reel",
    name: "Facebook Reel",
    description: "Short-form vertical video, up to 90 seconds. Algorithmically prioritized for reach.",
    asset_slots: { count: 1, allowed_types: ["video"], aspect_ratios: ["9:16"], duration_min_sec: 3, duration_max_sec: 90 },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true, sound: false },
    api_endpoint: "POST /{page_id}/video_reels",
    sort_order: 40,
  },

  // ── Instagram ──────────────────────────────────────────────
  {
    platform: "instagram",
    format: "single_image",
    name: "Instagram Single Image",
    description: "Standard photo post to an Instagram Business account.",
    asset_slots: { count: 1, allowed_types: ["image"], aspect_ratios: ["1:1", "4:5"], duration_max_sec: null },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true },
    api_endpoint: "POST /{ig_user_id}/media + /media_publish",
    sort_order: 50,
  },
  {
    platform: "instagram",
    format: "carousel",
    name: "Instagram Carousel",
    description: "Up to 10 images or videos in a swipeable carousel. High-engagement format on Instagram.",
    asset_slots: { count_min: 2, count_max: 10, allowed_types: ["image", "video"], aspect_ratios: ["1:1", "4:5"], duration_max_sec: null },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true },
    api_endpoint: "POST /{ig_user_id}/media (carousel) + /media_publish",
    sort_order: 60,
  },
  {
    platform: "instagram",
    format: "reel",
    name: "Instagram Reel",
    description: "Vertical short-form video, up to 90 seconds. Highest-reach format on Instagram.",
    asset_slots: { count: 1, allowed_types: ["video"], aspect_ratios: ["9:16"], duration_min_sec: 3, duration_max_sec: 90 },
    metadata_requirements: { caption: true, link: false, cta: false, hashtags: true, cover_frame: true, sound: false },
    api_endpoint: "POST /{ig_user_id}/media (REELS) + /media_publish",
    sort_order: 70,
  },
  {
    platform: "instagram",
    format: "story",
    name: "Instagram Story",
    description: "Vertical 9:16 image or video, 24-hour ephemeral. Optional sticker overlays.",
    asset_slots: { count: 1, allowed_types: ["image", "video"], aspect_ratios: ["9:16"], duration_max_sec: 60 },
    metadata_requirements: { caption: false, link: false, cta: false, hashtags: false, link_sticker: false },
    api_endpoint: "POST /{ig_user_id}/media (STORIES) + /media_publish",
    sort_order: 80,
  },

  // ── Pinterest ──────────────────────────────────────────────
  {
    platform: "pinterest",
    format: "tall_pin",
    name: "Pinterest Tall Pin",
    description: "Vertical 2:3 image pin, optimized for Pinterest's search-driven discovery.",
    asset_slots: { count: 1, allowed_types: ["image"], aspect_ratios: ["2:3"], duration_max_sec: null },
    metadata_requirements: { caption: true, title: true, link: true, cta: false, hashtags: false },
    api_endpoint: "POST /v5/pins",
    sort_order: 90,
  },

  // ── Blog (TracPost-owned property) ─────────────────────────
  {
    platform: "blog",
    format: "article",
    name: "Blog Article",
    description: "Long-form article published to the subscriber's TracPost-owned blog. SEO-optimized.",
    asset_slots: { count_min: 1, count_max: 20, allowed_types: ["image"], aspect_ratios: ["any"], duration_max_sec: null, hero_image: true },
    metadata_requirements: { caption: false, title: true, slug: true, body: true, link: false, cta: true, hashtags: false, tags: true, meta_description: true },
    api_endpoint: "internal: POST /api/blog/articles",
    sort_order: 100,
  },
];

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("090: post_templates registry + social_posts template/content_type fields...");

  // ── 1. post_templates table ──────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS post_templates (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform                 TEXT NOT NULL,
      format                   TEXT NOT NULL,
      name                     TEXT NOT NULL,
      description              TEXT,
      asset_slots              JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata_requirements    JSONB NOT NULL DEFAULT '{}'::jsonb,
      api_endpoint             TEXT,
      platform_constraints     JSONB DEFAULT '{}'::jsonb,
      enabled                  BOOLEAN DEFAULT true,
      sort_order               INTEGER DEFAULT 100,
      performance_data         JSONB DEFAULT '{}'::jsonb,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (platform, format)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_post_templates_platform ON post_templates(platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_post_templates_enabled ON post_templates(enabled, platform, sort_order) WHERE enabled = true`;
  console.log("  + post_templates table");
  console.log("  + indexes on (platform), (enabled, platform, sort_order)");

  // ── 2. social_posts additive columns ─────────────────────
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES post_templates(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'post'`;
  console.log("  + social_posts.template_id (UUID, nullable FK)");
  console.log("  + social_posts.content_type (TEXT, default 'post')");

  // ── 3. Seed MVP templates (idempotent — upserts on (platform, format)) ──
  let inserted = 0;
  let updated = 0;
  for (const t of TEMPLATES) {
    const result = await sql`
      INSERT INTO post_templates (
        platform, format, name, description,
        asset_slots, metadata_requirements, api_endpoint, sort_order
      )
      VALUES (
        ${t.platform}, ${t.format}, ${t.name}, ${t.description ?? null},
        ${JSON.stringify(t.asset_slots)}::jsonb,
        ${JSON.stringify(t.metadata_requirements)}::jsonb,
        ${t.api_endpoint ?? null},
        ${t.sort_order ?? 100}
      )
      ON CONFLICT (platform, format) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        asset_slots = EXCLUDED.asset_slots,
        metadata_requirements = EXCLUDED.metadata_requirements,
        api_endpoint = EXCLUDED.api_endpoint,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      RETURNING (xmax = 0) AS was_insert
    `;
    if (result[0].was_insert) inserted++;
    else updated++;
  }
  console.log(`  + seeded ${inserted} new templates, updated ${updated} existing`);

  // ── 4. Verification ──────────────────────────────────────
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM post_templates`;
  const platformBreakdown = await sql`
    SELECT platform, COUNT(*)::int AS count
    FROM post_templates
    WHERE enabled = true
    GROUP BY platform
    ORDER BY platform
  `;
  console.log(`\n✓ Migration 090 complete. ${total} templates in registry.`);
  console.log("  Per-platform:");
  for (const row of platformBreakdown) {
    console.log(`    ${row.platform}: ${row.count}`);
  }
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
