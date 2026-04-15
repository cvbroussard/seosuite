/**
 * One-off: generate and store website_copy JSONB for a tenant, using
 * the existing spinner's copy-generator. Without this, the centralized
 * marketing pages render with fallback placeholders ("Welcome to…")
 * instead of brand-voiced copy.
 *
 * Usage: node scripts/populate-website-copy.js <site_id>
 *
 * The generated copy follows the same prompt + playbook path the
 * spinner used when deploying static sites. Safe to re-run — each run
 * overwrites website_copy for that site.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Usage: node scripts/populate-website-copy.js <site_id>");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`
    SELECT id, name, business_type, location, brand_playbook
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) {
    console.error(`Site ${siteId} not found`);
    process.exit(1);
  }
  if (!site.brand_playbook) {
    console.error(`Site has no brand_playbook — sharpen the playbook first`);
    process.exit(1);
  }

  const playbook = site.brand_playbook;
  const positioning = playbook.brandPositioning || {};
  const angle = (positioning.selectedAngles || [])[0] || {};
  const audience = playbook.audienceResearch || {};
  const langMap = audience.languageMap || {};
  const painPoints = (audience.painPoints || []).map((p) => String(p.pain));
  const offerCore = playbook.offerCore || {};
  const offerStatement = offerCore.offerStatement || {};

  // Dynamic import of the TS module via tsx's runtime isn't easy here;
  // we inline the same prompt + Anthropic call that copy-generator.ts makes.
  // Keeps the script self-contained and avoids a TS compilation step.
  const Anthropic = require("@anthropic-ai/sdk").default;
  const anthropic = new Anthropic();

  const ctx = {
    siteName: String(site.name),
    businessType: String(site.business_type || "business"),
    location: String(site.location || ""),
    tagline: String(angle.tagline || ""),
    offer: String(offerStatement.finalStatement || ""),
    tone: String(angle.tone || ""),
    contentThemes: (angle.contentThemes || []),
    painPoints,
    desirePhrases: langMap.desirePhrases || [],
  };

  console.log(`Generating website copy for: ${ctx.siteName} (${ctx.businessType})`);
  console.log(`Tagline: ${ctx.tagline}`);
  console.log(`Tone: ${ctx.tone.slice(0, 80)}…`);

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Generate website copy for a ${ctx.businessType} business.

## Business
Name: ${ctx.siteName}
Location: ${ctx.location}
Tagline: ${ctx.tagline}
Offer: ${ctx.offer}
Tone: ${ctx.tone}

## Content Themes
${ctx.contentThemes.join("\n")}

## Audience Pain Points
${ctx.painPoints.slice(0, 3).join("\n")}

## Audience Desires
${ctx.desirePhrases.slice(0, 5).join(", ")}

Generate website copy in the brand's voice. Not generic marketing copy — write as if you ARE this business talking to a specific audience who has been underserved by generic alternatives.

Return ONLY valid JSON (no markdown):
{
  "home": {
    "heroTitle": "<compelling headline, 6-10 words, not the tagline>",
    "heroSubtitle": "<2 sentences that speak directly to the audience's pain and desire>",
    "ctaText": "<CTA button text, 2-4 words>",
    "servicesTitle": "<section title for what we do>",
    "servicesSubtitle": "<one sentence describing our approach>",
    "services": [
      {"title": "<service name>", "description": "<2 sentences>"},
      {"title": "<service name>", "description": "<2 sentences>"},
      {"title": "<service name>", "description": "<2 sentences>"}
    ],
    "galleryTitle": "<section title for recent work>",
    "gallerySubtitle": "<one sentence>"
  },
  "about": {
    "headline": "<about page title>",
    "story": "<3 paragraphs as HTML <p> tags. Tell the business story — who we are, why we do this, what makes us different. Write in first person plural. No platitudes.>",
    "values": [
      {"title": "<value>", "description": "<2 sentences>"},
      {"title": "<value>", "description": "<2 sentences>"},
      {"title": "<value>", "description": "<2 sentences>"}
    ],
    "stats": [
      {"value": "<number>", "label": "<what it measures>"},
      {"value": "<number>", "label": "<what it measures>"},
      {"value": "<number>", "label": "<what it measures>"}
    ],
    "brandsTitle": "<title for materials/brands section>"
  },
  "work": {
    "headline": "<our work page title>",
    "subtitle": "<one sentence about our portfolio>",
    "blogTitle": "<blog section title>",
    "blogSubtitle": "<one sentence about our articles>"
  },
  "contact": {
    "headline": "<contact page title, inviting>",
    "subtitle": "<2 sentences, warm, professional, removes friction>"
  },
  "meta": {
    "homeTitle": "<SEO title for home, under 60 chars>",
    "homeDescription": "<SEO description, under 160 chars>",
    "aboutTitle": "<SEO title for about>",
    "aboutDescription": "<SEO description>",
    "workTitle": "<SEO title for work/projects>",
    "workDescription": "<SEO description>",
    "contactTitle": "<SEO title for contact>",
    "contactDescription": "<SEO description>"
  }
}

Rules:
- Hero title should NOT be the tagline — it's a different hook
- Services should reflect actual capabilities, not generic categories
- Story should sound human, not corporate
- Stats should be plausible for a ${ctx.businessType} in ${ctx.location}
- All copy should match the tone: ${ctx.tone.slice(0, 100)}`,
      },
    ],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const copy = JSON.parse(cleaned);

  await sql`
    UPDATE sites SET website_copy = ${JSON.stringify(copy)}::jsonb
    WHERE id = ${siteId}
  `;

  console.log(`\nGenerated in ${elapsed}s. Preview:`);
  console.log(`  home.heroTitle:       "${copy.home.heroTitle}"`);
  console.log(`  home.heroSubtitle:    "${copy.home.heroSubtitle.slice(0, 80)}…"`);
  console.log(`  home.ctaText:         "${copy.home.ctaText}"`);
  console.log(`  home.services:        ${copy.home.services.length} items`);
  console.log(`  about.headline:       "${copy.about.headline}"`);
  console.log(`  about.values:         ${copy.about.values.length} items`);
  console.log(`  about.stats:          ${copy.about.stats.length} items`);
  console.log(`  work.headline:        "${copy.work.headline}"`);
  console.log(`  contact.headline:     "${copy.contact.headline}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
