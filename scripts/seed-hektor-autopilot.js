const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Configuring Hektor K9 autopilot...\n");

  const [site] = await sql`
    UPDATE sites
    SET
      autopilot_enabled = true,
      cadence_config = ${JSON.stringify({
        ig_feed: 4,       // 4 posts/week
        ig_story: 7,      // daily
        ig_reel: 2,       // 2 reels/week
        youtube: 0.25,    // 1/month
        gbp: 1,           // 1/week
      })},
      content_pillars = ${'{"result","training_action","showcase","educational"}'},
      autopilot_config = ${JSON.stringify({
        min_quality: 0.4,       // assets below this auto-shelve
        flag_faces: true,       // flag assets with unrecognized faces
        shelf_capacity: 50,     // max shelved assets before oldest purge
        max_flag_rate: 0.05,    // alert if flag rate exceeds 5%
        veto_window_hours: 4,   // hours before scheduled_at that veto is allowed
        backfill_from_shelf: true, // pull shelf inventory during dry spells
      })}
    WHERE name = 'hektork9.com'
    RETURNING id, name, autopilot_enabled, cadence_config, content_pillars
  `;

  if (!site) {
    console.log("Site 'hektork9.com' not found. Run seed-hektor.js first.");
    process.exit(1);
  }

  console.log(`  Site: ${site.name}`);
  console.log(`  Autopilot: ${site.autopilot_enabled}`);
  console.log(`  Cadence:`, site.cadence_config);
  console.log(`  Pillars:`, site.content_pillars);
  console.log("\n✅ Autopilot configured.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
