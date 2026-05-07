/**
 * v2 article schema — clean foundation parallel to legacy.
 *
 * Greenfield tables for articles + projects:
 *   - blog_posts_v2, blog_post_assets, blog_post_captions
 *   - projects_v2,   project_assets,   project_captions
 *
 * Plus additive enhancements to media_assets so video posters and
 * normalized media kinds become first-class without disturbing the
 * legacy code paths that still read media_type.
 *
 * See memory: project_tracpost_v2_article_schema.md
 *
 * Run: node scripts/migrate-095-v2-article-schema.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("v2 article schema migration starting…");

  // ── media_assets: additive only ────────────────────────────────
  // Existing legacy code paths still read media_type. The new fields
  // are populated by the v2 generator going forward; legacy data
  // gets backfilled by a separate one-shot script when ready.
  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS poster_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL
  `;
  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS mime_type TEXT
  `;
  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS media_kind TEXT
        CHECK (media_kind IS NULL OR media_kind IN ('image','video','audio'))
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ma_poster
      ON media_assets (poster_asset_id) WHERE poster_asset_id IS NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ma_kind
      ON media_assets (site_id, media_kind)
  `;
  console.log("  ✓ media_assets enhanced (poster_asset_id, mime_type, media_kind)");

  // ── blog_posts_v2 ──────────────────────────────────────────────
  // Strict typed columns. metadata JSONB reserved for truly variable
  // per-article diagnostics — never relationships.
  // services_v2 created BEFORE blog_posts_v2 because blog_posts_v2.service_id
  // FK references it. Authority articles about a service link back here.
  await sql`
    CREATE TABLE IF NOT EXISTS services_v2 (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

      slug              TEXT NOT NULL,
      name              TEXT NOT NULL,
      description       TEXT,
      body              TEXT,                            -- optional long-form authority copy
      excerpt           TEXT,

      hero_asset_id     UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      poster_asset_id   UUID REFERENCES media_assets(id) ON DELETE SET NULL,

      price_range       TEXT,
      duration          TEXT,
      display_order     INT NOT NULL DEFAULT 0,

      content_pillars   TEXT[] NOT NULL DEFAULT '{}',
      content_tags      TEXT[] NOT NULL DEFAULT '{}',

      meta_title        TEXT,
      meta_description  TEXT,

      status            TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','archived')),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

      UNIQUE (site_id, slug)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sv2_site ON services_v2 (site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sv2_status ON services_v2 (site_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sv2_order ON services_v2 (site_id, display_order)`;
  console.log("  ✓ services_v2");

  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts_v2 (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

      slug              TEXT NOT NULL,
      title             TEXT NOT NULL,
      body              TEXT NOT NULL,
      excerpt           TEXT,

      hero_asset_id     UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      poster_asset_id   UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      seed_asset_id     UUID REFERENCES media_assets(id) ON DELETE SET NULL,

      -- Optional link back to a service when the article is authority
      -- content tied to a service category. Service detail pages render
      -- related articles via WHERE service_id = ?. NULL for editorial
      -- articles unrelated to any service.
      service_id        UUID REFERENCES services_v2(id) ON DELETE SET NULL,

      meta_title        TEXT,
      meta_description  TEXT,

      content_pillars   TEXT[] NOT NULL DEFAULT '{}',
      content_tags      TEXT[] NOT NULL DEFAULT '{}',

      status            TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','flagged','archived')),
      published_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

      UNIQUE (site_id, slug)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpv2_site ON blog_posts_v2 (site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpv2_status ON blog_posts_v2 (site_id, status)`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_bpv2_published
      ON blog_posts_v2 (site_id, published_at DESC)
      WHERE status = 'published'
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpv2_hero ON blog_posts_v2 (hero_asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpv2_service ON blog_posts_v2 (service_id) WHERE service_id IS NOT NULL`;
  console.log("  ✓ blog_posts_v2");

  // ── blog_post_assets — the manifest ────────────────────────────
  // Body uses {{asset:uuid}} placeholders; this table is the
  // source of truth for which assets the article uses and in what order.
  await sql`
    CREATE TABLE IF NOT EXISTS blog_post_assets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      blog_post_id    UUID NOT NULL REFERENCES blog_posts_v2(id) ON DELETE CASCADE,
      media_asset_id  UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      slot_index      INT NOT NULL,
      role            TEXT NOT NULL CHECK (role IN ('hero','body','gallery')),
      alt_text        TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (blog_post_id, slot_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpa_post ON blog_post_assets (blog_post_id, slot_index)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpa_asset ON blog_post_assets (media_asset_id)`;
  console.log("  ✓ blog_post_assets");

  // ── blog_post_captions — pre-generated LLM artifacts ───────────
  // Generated ONCE at article-creation time per platform_format.
  // Compose + autopilot read from here; never re-generate per request.
  await sql`
    CREATE TABLE IF NOT EXISTS blog_post_captions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      blog_post_id            UUID NOT NULL REFERENCES blog_posts_v2(id) ON DELETE CASCADE,
      platform_format         TEXT NOT NULL,
      caption                 TEXT NOT NULL,
      hashtags                TEXT[] NOT NULL DEFAULT '{}',
      model                   TEXT NOT NULL,
      generation_prompt_hash  TEXT,
      generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (blog_post_id, platform_format)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpc_post ON blog_post_captions (blog_post_id)`;
  console.log("  ✓ blog_post_captions");

  // ── projects_v2 ────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS projects_v2 (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

      slug              TEXT NOT NULL,
      name              TEXT NOT NULL,
      description       TEXT,

      hero_asset_id     UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      poster_asset_id   UUID REFERENCES media_assets(id) ON DELETE SET NULL,

      content_pillars   TEXT[] NOT NULL DEFAULT '{}',
      content_tags      TEXT[] NOT NULL DEFAULT '{}',

      status            TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','complete','archived')),
      start_date        DATE,
      end_date          DATE,

      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (site_id, slug)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pv2_site ON projects_v2 (site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pv2_status ON projects_v2 (site_id, status)`;
  console.log("  ✓ projects_v2");

  // ── project_assets — manifest ──────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS project_assets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id      UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
      media_asset_id  UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      slot_index      INT NOT NULL,
      role            TEXT NOT NULL CHECK (role IN ('hero','body','gallery')),
      alt_text        TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, slot_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_project ON project_assets (project_id, slot_index)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_asset ON project_assets (media_asset_id)`;
  console.log("  ✓ project_assets");

  // ── project_captions ───────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS project_captions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id              UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
      platform_format         TEXT NOT NULL,
      caption                 TEXT NOT NULL,
      hashtags                TEXT[] NOT NULL DEFAULT '{}',
      model                   TEXT NOT NULL,
      generation_prompt_hash  TEXT,
      generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, platform_format)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_project ON project_captions (project_id)`;
  console.log("  ✓ project_captions");

  // ── service_assets — manifest ──────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS service_assets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id      UUID NOT NULL REFERENCES services_v2(id) ON DELETE CASCADE,
      media_asset_id  UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      slot_index      INT NOT NULL,
      role            TEXT NOT NULL CHECK (role IN ('hero','body','gallery')),
      alt_text        TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (service_id, slot_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sa_service ON service_assets (service_id, slot_index)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sa_asset ON service_assets (media_asset_id)`;
  console.log("  ✓ service_assets");

  // ── service_captions ───────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS service_captions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id              UUID NOT NULL REFERENCES services_v2(id) ON DELETE CASCADE,
      platform_format         TEXT NOT NULL,
      caption                 TEXT NOT NULL,
      hashtags                TEXT[] NOT NULL DEFAULT '{}',
      model                   TEXT NOT NULL,
      generation_prompt_hash  TEXT,
      generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (service_id, platform_format)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sc_service ON service_captions (service_id)`;
  console.log("  ✓ service_captions");

  console.log("");
  console.log("Migration complete.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Build v2 generator (writes to blog_posts_v2 + assets + captions)");
  console.log("  2. Replace /api/compose/anchors to read v2");
  console.log("  3. Regenerate Epicurious articles into v2 when ready");
  console.log("  4. Renderer cutover (separate ship — legacy keeps rendering until then)");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
