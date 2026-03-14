const { neon } = require("@neondatabase/serverless");
const { createHash, randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const sql = neon(process.env.DATABASE_URL);

  // Generate API key
  const apiKey = `seo_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(apiKey).digest("hex");

  console.log("Seeding Hektor K9 subscriber...\n");

  // Create subscriber
  const [subscriber] = await sql`
    INSERT INTO subscribers (name, api_key_hash, plan)
    VALUES ('Hektor K9', ${hash}, 'pro')
    ON CONFLICT (api_key_hash) DO NOTHING
    RETURNING id, name, plan
  `;

  if (!subscriber) {
    console.log("Subscriber already exists (hash collision). Fetching...");
    const [existing] = await sql`SELECT id, name FROM subscribers WHERE name = 'Hektor K9' LIMIT 1`;
    if (existing) {
      console.log(`  Subscriber: ${existing.id}`);
    }
    return;
  }

  console.log(`  Subscriber: ${subscriber.id} (${subscriber.name})`);

  // Create site
  const [site] = await sql`
    INSERT INTO sites (subscriber_id, name, url, brand_voice)
    VALUES (
      ${subscriber.id},
      'hektork9.com',
      'https://hektork9.com',
      ${JSON.stringify({
        tone: "confident, professional, luxury",
        keywords: ["dog training", "West Palm Beach", "Schutzhund", "balanced training"],
        avoid: ["cheap", "discount", "basic"],
      })}
    )
    RETURNING id, name, url
  `;

  console.log(`  Site: ${site.id} (${site.name})`);

  console.log("\n─── API Key (save this — shown once) ───");
  console.log(`  ${apiKey}`);
  console.log("─────────────────────────────────────────\n");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
