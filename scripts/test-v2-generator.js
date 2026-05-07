/**
 * End-to-end smoke test for the v2 content generator.
 *
 * Runs `generateBlogPost` against a real Epicurious seed asset, then
 * inspects the resulting blog_posts_v2 row + asset manifest +
 * content_kit. Finally slices the kit for FB Feed, IG Reel, and
 * Twitter to demonstrate the full Compose-time path.
 *
 * Run: node scripts/test-v2-generator.js [--commit]
 *   --commit  Keep the generated row. Default: roll back at the end.
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

const COMMIT = process.argv.includes("--commit");
const SEED_ASSET_ID = "50f44732-76f0-479b-b1e1-2c97dc1e2807";

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`SELECT id, name FROM sites WHERE LOWER(name) LIKE '%epicurious%' LIMIT 1`;
  if (!site) throw new Error("Epicurious site not found");
  console.log(`Site:      ${site.name} (${site.id})`);
  console.log(`Seed:      ${SEED_ASSET_ID}`);
  console.log(`Commit:    ${COMMIT ? "yes" : "no — will roll back"}`);
  console.log("");

  // Dynamic import so we get the TS-compiled paths the app uses.
  // The generator + slicer are written in TypeScript; tsx handles it.
  console.log("Loading v2 generator…");
  const { generateBlogPost } = await import("../src/lib/v2-generator/adapters.ts");
  const { slice } = await import("../src/lib/v2-generator/slicers/index.ts");
  console.log("");

  console.log("Calling generateBlogPost (2 LLM calls)…");
  const t0 = Date.now();
  const result = await generateBlogPost({
    siteId: site.id,
    seedAssetId: SEED_ASSET_ID,
    status: "draft",
  });
  const elapsed = Date.now() - t0;
  console.log(`✓ Generated in ${elapsed}ms`);
  console.log("");
  console.log(`Result:`);
  console.log(`  pool:         ${result.pool}`);
  console.log(`  id:           ${result.id}`);
  console.log(`  slug:         ${result.slug}`);
  console.log(`  title:        ${result.title}`);
  console.log(`  assetsCount:  ${result.assetsCount}`);
  console.log("");

  // Inspect what landed in the DB
  const [row] = await sql`
    SELECT title, slug, excerpt, body, content_pillars, content_tags,
           hero_asset_id, content_kit
    FROM blog_posts_v2
    WHERE id = ${result.id}
  `;
  console.log("─── DB row ───");
  console.log(`  title:        ${row.title}`);
  console.log(`  slug:         ${row.slug}`);
  console.log(`  excerpt:      ${row.excerpt}`);
  console.log(`  pillars:      ${(row.content_pillars || []).join(", ")}`);
  console.log(`  tags:         ${(row.content_tags || []).join(", ")}`);
  console.log(`  hero:         ${row.hero_asset_id}`);
  console.log(`  body length:  ${(row.body || "").length} chars`);
  console.log("");

  console.log("─── Body preview (first 500 chars) ───");
  console.log((row.body || "").slice(0, 500) + (row.body.length > 500 ? "…" : ""));
  console.log("");

  console.log("─── Asset manifest ───");
  const manifest = await sql`
    SELECT slot_index, role, media_asset_id
    FROM blog_post_assets
    WHERE blog_post_id = ${result.id}
    ORDER BY slot_index
  `;
  for (const m of manifest) {
    console.log(`  slot ${m.slot_index}: ${m.role.padEnd(8)} ${m.media_asset_id}`);
  }
  console.log("");

  console.log("─── Content kit ───");
  const kit = row.content_kit;
  console.log(`  hooks (${kit.hooks?.length || 0}):`);
  for (const h of (kit.hooks || []).slice(0, 4)) console.log(`    • ${h}`);
  console.log(`  takeaways (${kit.takeaways?.length || 0}):`);
  for (const t of (kit.takeaways || []).slice(0, 4)) console.log(`    • ${t}`);
  console.log(`  keyTerms: ${(kit.keyTerms || []).join(", ")}`);
  console.log(`  proofPoints (${kit.proofPoints?.length || 0}):`);
  for (const p of (kit.proofPoints || []).slice(0, 3)) console.log(`    • ${p}`);
  console.log(`  inlineLinkContexts: ${(kit.inlineLinkContexts || []).join(" | ")}`);
  console.log(`  ctaVariants.short: ${(kit.ctaVariants?.short || []).join(" | ")}`);
  console.log(`  voice: emoji=${kit.voiceMarkers?.emojiPolicy} excl=${kit.voiceMarkers?.exclamationDensity} casing=${kit.voiceMarkers?.casing}`);
  console.log("");

  // Slice for three formats
  console.log("─── Slicing the kit (no LLM, microseconds) ───");
  const ctx = {
    anchorUrl: `https://epicuriouskitchens.com/blog/${row.slug}`,
    title: row.title,
  };
  for (const fmt of ["fb_feed", "ig_reel", "twitter", "linkedin"]) {
    const sliced = slice(fmt, kit, ctx);
    console.log(`\n  ━━ ${fmt} (${sliced.caption.length} chars, ${sliced.hashtags.length} tags) ━━`);
    console.log("  " + sliced.caption.split("\n").join("\n  "));
    if (sliced.hashtags.length) console.log("  TAGS: " + sliced.hashtags.join(" "));
  }
  console.log("");

  if (!COMMIT) {
    console.log("Rolling back (delete blog_posts_v2 row + manifest)…");
    await sql`DELETE FROM blog_posts_v2 WHERE id = ${result.id}`;
    console.log("✓ Rolled back. Re-run with --commit to keep the row.");
  } else {
    console.log(`✓ Committed. View at:`);
    console.log(`    blog_posts_v2.id = ${result.id}`);
    console.log(`    slug = ${row.slug}`);
  }
}

main().catch((e) => {
  console.error("");
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
