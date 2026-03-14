const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running autopilot authority model migration...\n");

  // ─── media_assets: triage pipeline fields ────────────────────────
  // triage_status: the pipeline's editorial verdict
  //   received  → just uploaded, not yet evaluated
  //   triaged   → AI evaluated, scored, assigned pillar
  //   scheduled → promoted into a publishing slot
  //   shelved   → usable but not selected (inventory for slow weeks)
  //   flagged   → AI uncertain, needs subscriber input (target < 5%)
  //   consumed  → used in a published post
  //   rejected  → subscriber vetoed or quality too low
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'received'`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3,2)`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS content_pillar TEXT`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS platform_fit TEXT[]`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS flag_reason TEXT`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS shelve_reason TEXT`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ`;
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload'`;
  console.log("✓ media_assets — triage columns");

  // ─── social_posts: authority model fields ────────────────────────
  // source_asset_id: which media_asset this post was composed from
  // authority: who/what created this post (pipeline, subscriber, trigger)
  // veto_at / veto_reason: subscriber's only lever — pull back a scheduled post
  // pillar: content pillar this post fills in the cadence
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS authority TEXT DEFAULT 'pipeline'`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_pillar TEXT`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS vetoed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS veto_reason TEXT`;
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS slot_id UUID`;
  console.log("✓ social_posts — authority columns");

  // ─── sites: cadence + autopilot config ───────────────────────────
  // autopilot_enabled: master switch for the pipeline
  // cadence_config: per-platform publishing cadence
  //   e.g. { "ig_feed": 4, "ig_story": 7, "youtube": 0.25, "gbp": 1 }
  //   values = posts per week
  // content_pillars: ordered list of content categories to rotate
  //   e.g. ["result", "training_action", "showcase", "educational"]
  // autopilot_flags: behavioral tuning
  //   e.g. { "flag_faces": true, "min_quality": 0.4, "shelf_capacity": 50 }
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS cadence_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS content_pillars TEXT[] DEFAULT '{}'`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS autopilot_config JSONB DEFAULT '{}'`;
  console.log("✓ sites — autopilot columns");

  // ─── publishing_slots: the calendar the pipeline fills ───────────
  // Each row = one scheduled window on one platform.
  // The pipeline creates empty slots from cadence_config,
  // then fills them by promoting the best available asset.
  //
  // status:
  //   open      → slot exists, no asset assigned yet
  //   filled    → asset promoted, post created and linked via post_id
  //   published → post went live
  //   skipped   → no inventory to fill this slot (shelf empty)
  //   vetoed    → subscriber pulled back the post
  await sql`
    CREATE TABLE IF NOT EXISTS publishing_slots (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      account_id      UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      platform        TEXT NOT NULL,
      content_pillar  TEXT,
      scheduled_at    TIMESTAMPTZ NOT NULL,
      status          TEXT DEFAULT 'open',
      post_id         UUID REFERENCES social_posts(id) ON DELETE SET NULL,
      asset_id        UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ publishing_slots");

  // ─── social_triggers: flip default from approval to autopilot ────
  // requires_approval was DEFAULT true — that's the old model.
  // For autopilot authority, the default is false (publish by default).
  // Existing rows keep their value; new triggers default to no-approval.
  await sql`ALTER TABLE social_triggers ALTER COLUMN requires_approval SET DEFAULT false`;
  console.log("✓ social_triggers — default requires_approval → false");

  // ─── subscriber_actions: the narrow set of things subscribers can do ─
  // Audit trail for subscriber interactions with the pipeline.
  // action types: veto, un-veto, flag_response, cadence_change
  // This is separate from social_post_history (which tracks post status
  // changes regardless of who caused them).
  await sql`
    CREATE TABLE IF NOT EXISTS subscriber_actions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      action_type   TEXT NOT NULL,
      target_type   TEXT NOT NULL,
      target_id     UUID NOT NULL,
      payload       JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ subscriber_actions");

  // ─── Indexes ─────────────────────────────────────────────────────
  await sql`CREATE INDEX IF NOT EXISTS idx_media_triage ON media_assets(site_id, triage_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_pillar ON media_assets(site_id, content_pillar, quality_score DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_slots_site_status ON publishing_slots(site_id, status, scheduled_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_slots_account ON publishing_slots(account_id, scheduled_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_source_asset ON social_posts(source_asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_actions ON subscriber_actions(site_id, created_at)`;
  console.log("✓ indexes");

  console.log("\n✅ Autopilot authority model migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
