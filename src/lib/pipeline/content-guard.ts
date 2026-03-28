import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface GuardResult {
  pass: boolean;
  flags: string[];
}

/**
 * Automated content safety scan for generated blog posts.
 * Runs between generation and draft storage.
 *
 * Checks for:
 * - Fabricated facts about real companies/products
 * - Inappropriate, exploitative, or violent content
 * - Specific prices, dollar amounts, cost estimates
 * - Defamatory or disparaging language about competitors
 * - Medical, legal, or financial claims that create liability
 * - Contact info that looks hallucinated (phone numbers, emails, addresses)
 *
 * Returns pass/fail with specific flag reasons.
 */
export async function scanContent(
  title: string,
  body: string,
  businessName: string
): Promise<GuardResult> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Review this blog article for a local business called "${businessName}". Flag any issues.

Title: ${title}

Article (first 2000 chars):
${body.slice(0, 2000)}

Check for these issues and return ONLY JSON:
1. "fabrication" — Claims specific facts about real companies/products that sound made up (founding dates, revenue, employee counts, awards not widely known)
2. "inappropriate" — Violence, exploitation, sexual content, hate speech, discrimination
3. "pricing" — Any specific dollar amounts, price ranges, or cost estimates
4. "defamation" — Negative claims about named competitors or their products
5. "liability" — Medical advice, legal guidance, financial recommendations, safety claims that could create liability
6. "hallucinated_contact" — Phone numbers, email addresses, street addresses that appear in the body (these are likely hallucinated)
7. "off_topic" — Content that has nothing to do with the business's industry

Return: {"pass": true, "flags": []}
Or: {"pass": false, "flags": ["pricing: mentions $80,000 kitchen remodel", "fabrication: claims Sub-Zero was founded in 1943"]}

Be strict on pricing and hallucinated contact info. Be lenient on general industry claims.`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleaned);

    return {
      pass: result.pass === true,
      flags: Array.isArray(result.flags) ? result.flags : [],
    };
  } catch {
    // If the guard itself fails, pass the content through
    // but log it — don't block publishing on a scan failure
    console.warn("Content guard scan failed — defaulting to pass");
    return { pass: true, flags: [] };
  }
}
