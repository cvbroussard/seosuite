/**
 * Adds hero composition descriptions to each Why Social Matters article.
 * Stored in metadata.hero_composition. The hero placeholder render shows
 * this description until real hero images are generated.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);

const COMPOSITIONS = {
  "humans-are-not-lone-wolves-business-has-always-been-social":
    "A late-afternoon coffee shop scene. Three groups visible: two people leaning in conversation, one person alone on a laptop visibly smiling at a screen, a table of three sharing one phone. Warm editorial light. The composition implies the same human behavior — connection — expressed through three different mediums. Documentary photography.",

  "how-social-networks-were-actually-built-the-trojan-horse-of-free":
    "A wrapped gift box stamped 'FREE' being unwrapped. Instead of a gift inside, an industrial mechanism is revealed — gears, sensors pointed outward like cameras, a side chute marked 'advertisers' with gold coins flowing out. Vintage industrial blueprint aesthetic, sepia tones. The title's metaphor made literal.",

  "the-reach-hierarchy-how-many-people-actually-see-each-platform":
    "A stylized bar chart on dark canvas, each bar composed not of solid color but of thousands of tiny human silhouettes packed like crowds. Facebook's bar towers; LinkedIn's bar is shorter but populated with suit-clad silhouettes; TikTok's bar shorter still but with younger, animated silhouettes. Editorial infographic, deliberately undermarketed-looking — feels like data, not a brochure.",

  "where-your-customers-actually-live-platform-fit-by-industry":
    "A stylized world atlas, but instead of countries each territory is a business type (wedding photographer, plumber, restaurateur, B2B consultant). Each territory has a 'capital city' pinned with the platform icon where their customers cluster. Cartography aesthetic — clean lines, minimal palette. The map as metaphor for industry-platform fit.",

  "you-used-to-pick-one-the-new-math-says-all-of-them":
    "A heavy industrial door caught mid-slam, dust particles suspended in golden backlight. Weathered painted text on the door reads 'THE PICK ONE PLATFORM ERA'. The composition suggests someone has just walked through and closed it definitively. Cinematic photography.",
};

(async () => {
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  let count = 0;
  for (const [slug, composition] of Object.entries(COMPOSITIONS)) {
    const result = await sql`
      UPDATE blog_posts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ hero_composition: composition })}::jsonb,
          updated_at = NOW()
      WHERE site_id = ${tp.id} AND slug = ${slug}
      RETURNING title
    `;
    if (result.length > 0) {
      console.log(`UPDATED: ${result[0].title}`);
      count++;
    } else {
      console.log(`NOT FOUND: ${slug}`);
    }
  }
  console.log(`\nDone. ${count}/${Object.keys(COMPOSITIONS).length} updated.`);
})().catch(err => { console.error(err); process.exit(1); });
