/**
 * Recordings table — canonical audio capture (LOCKED 2026-05-09).
 *
 * Per the audio-capture-floor thesis: recordings joined to media_assets
 * is the ONLY canonical audio data structure. Speaker fingerprints, voice
 * clones, brand voice patterns, and audio testimonial slices all derive
 * from this primary capture.
 *
 * Phase 1 schema — minimum viable. No clips table (slicing within),
 * no recording_uses (cross-asset reuse), no embedding column (compute
 * lazily from bytes). Add when use cases land.
 *
 * Run: node scripts/migrate-107-recordings-table.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Creating recordings table...");
  await sql`
    CREATE TABLE IF NOT EXISTS recordings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      storage_url TEXT NOT NULL,
      duration_ms INTEGER NULL,
      mime_type TEXT NOT NULL,
      transcript TEXT NULL,
      transcribed_at TIMESTAMPTZ NULL,
      transcribe_provider TEXT NULL,
      speaker_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'briefing',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ NULL
    )
  `;
  console.log("  ✓ recordings table created");

  // Indexes for the common query patterns
  await sql`
    CREATE INDEX IF NOT EXISTS idx_recordings_site
    ON recordings (site_id, created_at DESC)
    WHERE archived_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_recordings_source_asset
    ON recordings (source_asset_id)
    WHERE source_asset_id IS NOT NULL AND archived_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_recordings_speaker
    ON recordings (speaker_persona_id)
    WHERE speaker_persona_id IS NOT NULL AND archived_at IS NULL
  `;
  console.log("  ✓ indexes created");

  // Auto-update trigger for updated_at (mirrors media_assets pattern from #105)
  await sql`
    CREATE OR REPLACE FUNCTION recordings_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await sql`DROP TRIGGER IF EXISTS trg_recordings_updated_at ON recordings`;
  await sql`
    CREATE TRIGGER trg_recordings_updated_at
      BEFORE UPDATE ON recordings
      FOR EACH ROW
      EXECUTE FUNCTION recordings_set_updated_at()
  `;
  console.log("  ✓ updated_at trigger installed");

  // Verify
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'recordings'
    ORDER BY ordinal_position
  `;
  console.log(`  ✓ verify: ${cols.length} columns: ${cols.map((c) => c.column_name).join(", ")}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
