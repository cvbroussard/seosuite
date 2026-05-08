/**
 * Briefing-required architecture: rename `triage_status='received'` to
 * `'pending_briefing'`.
 *
 * Locks the principle that human briefing is required before any asset
 * enters the active pool. Old `'received'` meant "needs AI triage";
 * new `'pending_briefing'` means "needs human briefing." After this
 * migration:
 *   - AI triage cron still runs and enriches metadata (ai_analysis,
 *     content_pillar suggestions, etc.) on pending_briefing assets,
 *     but does NOT auto-promote state to 'triaged'.
 *   - Only human briefing action (saving caption + tags via PATCH
 *     /api/assets/:id) flips state to 'triaged'.
 *   - 'shelved' / 'flagged' / 'quarantined' continue to be set
 *     automatically for low-quality / consent-needed / guard-violation
 *     content (briefing not required for those).
 *
 * Code changes that pair with this migration:
 *   - src/lib/pipeline/triage.ts — stop returning 'triaged'; default
 *     outcome stays at 'pending_briefing' (semantic, not state-changing)
 *   - src/lib/pipeline/video-pool.ts — write 'pending_briefing'
 *   - src/lib/pdf-process.ts — write 'pending_briefing'
 *   - src/lib/inbox/sync-rss.ts — write 'pending_briefing'
 *   - src/app/api/assets/route.ts — write 'pending_briefing'
 *   - src/app/api/assets/[id]/route.ts — PATCH flips to 'triaged' when
 *     briefing fields are populated
 *   - All cron pickup queries: WHERE triage_status='pending_briefing'
 *
 * Run: node scripts/migrate-099-pending-briefing.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Renaming triage_status='received' → 'pending_briefing'...");

  // Update existing rows
  const updated = await sql`
    UPDATE media_assets
    SET triage_status = 'pending_briefing'
    WHERE triage_status = 'received'
    RETURNING id
  `;
  console.log(`  ✓ Updated ${updated.length} existing rows`);

  // Change column DEFAULT so future INSERTs without explicit triage_status
  // land in the new state.
  await sql`
    ALTER TABLE media_assets
    ALTER COLUMN triage_status SET DEFAULT 'pending_briefing'
  `;
  console.log("  ✓ Changed DEFAULT triage_status to 'pending_briefing'");

  console.log("");
  console.log("Migration complete. Code-side rename and behavior changes ship in the same commit.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
