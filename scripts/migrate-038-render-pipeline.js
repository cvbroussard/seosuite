/**
 * Migration 038: Render pipeline foundation.
 *
 * Adds the RENDER step to the content pipeline:
 * Capture → Triage → RENDER → Caption → Publish
 *
 * - media_assets.variants (JSONB) — per-platform rendered variant inventory
 * - media_assets.render_status — pending/rendered/failed/skipped
 * - sites.render_config — tenant render preferences (watermark, grade, CTAs)
 * - sites.brand_assets — logo URL, fonts, color palette for overlays
 * - render_templates — platform-wide render template definitions
 * - render_history — what was rendered, when, with what config (learning loop)
 * - carousel_compositions — composed carousel definitions
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("038: Render pipeline foundation...");

  // ── 1. media_assets additions ──
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS render_status TEXT DEFAULT 'pending'`;
  console.log("  + media_assets.variants (JSONB)");
  console.log("  + media_assets.render_status (TEXT)");

  // ── 2. sites additions ──
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS render_config JSONB DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_assets JSONB DEFAULT '{}'::jsonb`;
  console.log("  + sites.render_config (JSONB)");
  console.log("  + sites.brand_assets (JSONB)");

  // ── 3. render_templates ──
  await sql`
    CREATE TABLE IF NOT EXISTS render_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      content_type TEXT,
      business_type TEXT,
      config JSONB NOT NULL,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_render_templates_platform ON render_templates(platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_render_templates_default ON render_templates(platform, business_type) WHERE is_default`;
  console.log("  + render_templates table");

  // ── 4. render_history ──
  await sql`
    CREATE TABLE IF NOT EXISTS render_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      config JSONB NOT NULL,
      variant_url TEXT NOT NULL,
      rendered_at TIMESTAMPTZ DEFAULT NOW(),
      engagement JSONB
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_render_history_asset ON render_history(asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_render_history_platform ON render_history(platform)`;
  console.log("  + render_history table");

  // ── 5. carousel_compositions ──
  await sql`
    CREATE TABLE IF NOT EXISTS carousel_compositions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      slide_asset_ids UUID[] NOT NULL,
      slide_configs JSONB NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_carousel_site ON carousel_compositions(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_carousel_project ON carousel_compositions(project_id)`;
  console.log("  + carousel_compositions table");

  // ── Verify ──
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name IN ('variants', 'render_status')
    ORDER BY column_name
  `;
  const tables = await sql`
    SELECT table_name,
           (SELECT COUNT(*)::int FROM information_schema.columns c
            WHERE c.table_name = t.table_name) AS col_count
    FROM information_schema.tables t
    WHERE table_name IN ('render_templates', 'render_history', 'carousel_compositions')
    ORDER BY table_name
  `;

  console.log("\nVerification — media_assets columns:");
  for (const c of cols) console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);
  console.log("New tables:");
  for (const t of tables) console.log(`  ${t.table_name.padEnd(28)} ${t.col_count} columns`);

  console.log("\n038: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
