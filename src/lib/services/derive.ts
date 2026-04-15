/**
 * Derive service rows from the brand playbook. Called after a
 * playbook sharpen finalizes — reads offerCore, benefits, use cases,
 * and the GBP primary category to generate 3–6 services with
 * names + descriptions + price-range heuristic.
 *
 * Existing services are NOT overwritten. If the site already has
 * services, this is a no-op — admin can trigger regeneration from
 * the UI.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DerivedService {
  name: string;
  description: string;
  priceRange?: string;
  duration?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function generateServices(
  playbook: BrandPlaybook,
  businessType: string | null,
  primaryCategoryName: string | null,
): Promise<DerivedService[]> {
  const offerCore = playbook.offerCore;
  const offerStatement = offerCore?.offerStatement?.finalStatement || "";
  const benefits = offerCore?.benefits || [];
  const useCases = offerCore?.useCases || [];

  const prompt = `You are defining the service lines for a ${businessType || primaryCategoryName || "local business"}. These service lines will appear as tiles on the business's website and feed local-SEO copy.

Context:
Offer statement: ${offerStatement || "(not set)"}
Key benefits: ${benefits.join("; ") || "(none)"}
Use cases: ${useCases.join("; ") || "(none)"}
Primary GBP category: ${primaryCategoryName || "(not set)"}

Return 3 to 6 service lines. Each must be a real, distinct offering the business provides — NOT a repeat of the business name, NOT a benefit statement, NOT a tagline. A service is something a customer can buy or book.

Reply with ONLY a JSON array, no prose:
[
  {
    "name": "Short service name (2-5 words)",
    "description": "One-sentence description of what the customer gets, written in present tense, second person voice. No marketing fluff.",
    "priceRange": "optional — e.g. '$500-2000' or 'Custom quote' or omit",
    "duration": "optional — e.g. '2 weeks' or '1 hour' or omit"
  }
]`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("LLM returned no JSON array");
  return JSON.parse(match[0]) as DerivedService[];
}

/**
 * Full derivation pipeline. Skips if the site already has services
 * (unless `force=true` is passed by an admin-triggered regen).
 */
export async function deriveServicesForSite(
  siteId: string,
  opts: { force?: boolean } = {},
): Promise<{ created: number; skipped: boolean }> {
  const [site] = await sql`
    SELECT business_type, brand_playbook FROM sites WHERE id = ${siteId}
  `;
  if (!site?.brand_playbook) {
    return { created: 0, skipped: true };
  }

  if (!opts.force) {
    const [existing] = await sql`SELECT COUNT(*)::int AS n FROM services WHERE site_id = ${siteId}`;
    if ((existing?.n as number) > 0) return { created: 0, skipped: true };
  }

  const [primaryCat] = await sql`
    SELECT gc.name FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId} AND sgc.is_primary = true
  `;

  const services = await generateServices(
    site.brand_playbook as BrandPlaybook,
    (site.business_type as string) || null,
    primaryCat?.name ? String(primaryCat.name) : null,
  );

  if (opts.force) {
    // Full replace when admin re-runs
    await sql`DELETE FROM services WHERE site_id = ${siteId} AND source = 'auto'`;
  }

  let created = 0;
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const slug = slugify(s.name);
    if (!slug) continue;
    await sql`
      INSERT INTO services (site_id, name, slug, description, price_range, duration, display_order, source)
      VALUES (${siteId}, ${s.name}, ${slug}, ${s.description}, ${s.priceRange || null}, ${s.duration || null}, ${i}, 'auto')
      ON CONFLICT (site_id, slug) DO NOTHING
    `;
    created++;
  }

  return { created, skipped: false };
}
