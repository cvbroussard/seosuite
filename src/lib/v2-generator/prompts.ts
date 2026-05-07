import type { ContentSpec } from "./types";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

/**
 * Prompt builders for the v2 generator's two LLM calls.
 *
 * Call 1 — body: produces title + body markdown + excerpt + meta + tags
 * Call 2 — kit:  produces structured ingredients (hooks/takeaways/etc.)
 *
 * Both calls share a brand-context preamble (built once from the
 * site's playbook + voice). The body call's output feeds the kit
 * call's context so kit ingredients are grounded in the actual
 * article.
 */

export interface BodyPromptInput {
  spec: ContentSpec;
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  /** Available media assets the LLM can reference via {{asset:UUID}}. */
  availableAssets: Array<{ id: string; type: string; hint?: string }>;
}

export function buildBodyPrompt(input: BodyPromptInput): string {
  const { spec, siteName, siteUrl, playbook, brandVoice, availableAssets } = input;
  const parts: string[] = [];

  parts.push("You write authoritative, voice-driven articles for a service business. The article serves as a destination — social posts will point at it. Lead the reader; don't pitch.");
  parts.push("");
  parts.push(brandPreamble(siteName, siteUrl, playbook, brandVoice));

  parts.push("");
  parts.push("## Article spec");
  parts.push(`Pool: ${spec.pool}`);
  parts.push(`Topic hint: ${spec.topicHint}`);
  if (spec.intent) parts.push(`Intent: ${spec.intent}`);
  if (spec.contentPillars?.length) {
    parts.push(`Content pillars to weave: ${spec.contentPillars.join(", ")}`);
  }

  parts.push("");
  parts.push("## Available assets");
  parts.push("Use these placeholders inline in body markdown to position assets. Pick the ones that fit; you don't have to use them all.");
  for (const a of availableAssets) {
    const hint = a.hint ? ` — ${a.hint}` : "";
    parts.push(`  {{asset:${a.id}}}  (${a.type}${hint})`);
  }

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "title": "...",
  "body": "...",                      // full markdown article body with {{asset:UUID}} placeholders inline
  "excerpt": "...",                   // 1-2 sentence summary, used in feeds + meta
  "metaTitle": "...",                 // ≤60 chars, SEO
  "metaDescription": "...",           // ≤160 chars, SEO
  "contentPillars": ["pillar1"],      // 1-3 SINGLE-WORD category labels. NOT sentences. NOT phrases.
  "contentTags": ["...", "..."]       // 5-10 short keywords (1-3 words each)
}`);
  parts.push("```");
  parts.push("");
  parts.push("Rules:");
  parts.push("- Use the audience's actual language (per playbook), not marketing speak");
  parts.push("- Body is markdown. Use ## subheads, lists, short paragraphs");
  parts.push("- Place assets where they reinforce the narrative — not all bunched up");
  parts.push("- Don't reference assets in prose ('see the image below'); the placeholders speak for themselves");
  parts.push("- Meta description is the snippet Google shows; make it specific");
  parts.push("- contentPillars are CATEGORICAL labels, like a taxonomy entry. Examples: \"craft\", \"workflow\", \"renovation\", \"design\", \"proof\". Single words. Lowercase. NEVER sentences or descriptions. If you write a sentence here, you've made a mistake.");
  parts.push("- contentTags are short keywords, 1-3 words each. Lowercase. Examples: \"kitchen design\", \"rift-sawn oak\", \"Pittsburgh remodel\".");

  return parts.join("\n");
}

export interface KitPromptInput {
  spec: ContentSpec;
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  /** Body output from the previous LLM call — anchors the kit. */
  bodyContext: {
    title: string;
    body: string;
    excerpt: string;
    contentTags: string[];
  };
}

export function buildKitPrompt(input: KitPromptInput): string {
  const { spec, siteName, siteUrl, playbook, brandVoice, bodyContext } = input;
  const parts: string[] = [];

  parts.push("You distill an article into structured ingredients. These ingredients feed a slicing system that composes social captions for every platform — short and long, casual and professional. Generate ingredients RICH enough that any platform's slicer can pull a great caption without further help.");
  parts.push("");
  parts.push(brandPreamble(siteName, siteUrl, playbook, brandVoice));

  parts.push("");
  parts.push("## The article");
  parts.push(`Title: "${bodyContext.title}"`);
  parts.push(`Excerpt: ${bodyContext.excerpt}`);
  parts.push(`Tags: ${bodyContext.contentTags.join(", ")}`);
  parts.push("");
  parts.push("Body:");
  parts.push("```");
  parts.push(bodyContext.body.slice(0, 6000)); // truncate to keep prompt bounded
  parts.push("```");

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "hooks": ["...", "...", "..."],              // 4-6 punchy opening lines, ≤120 chars each, ranked strongest first
  "takeaways": ["...", "..."],                 // 4-6 single-sentence value props, ≤140 chars each
  "keyTerms": ["...", "..."],                  // 6-12 domain words / proper nouns / location markers
  "proofPoints": ["..."],                      // 3-5 specific facts, numbers, names that lend authority
  "inlineLinkContexts": ["...", "..."],        // 4-6 natural phrasings to introduce the URL ("see the full breakdown", "details on the blog")
  "ctaVariants": {
    "short": ["..."],                          // 3-4 ultra-brief CTAs (≤25 chars)
    "medium": ["..."],                         // 3-4 medium CTAs (≤60 chars)
    "long": ["..."]                            // 2-3 longer CTAs (≤120 chars)
  },
  "voiceMarkers": {
    "signoffs": ["..."],                       // 1-3 natural sign-off lines if relevant
    "emojiPolicy": "none|sparse|frequent",
    "exclamationDensity": "low|medium|high",
    "casing": "sentence|title|lowercase"
  }
}`);
  parts.push("```");
  parts.push("");
  parts.push("Rules:");
  parts.push("- Hooks STOP THE SCROLL — every one must work as a first line");
  parts.push("- Takeaways are stand-alone — readable without context");
  parts.push("- Key terms are PascalCase-able later; use natural casing here");
  parts.push("- Voice markers describe the article's actual register, not aspirational");
  parts.push(`- Topic context: ${spec.pool} for ${siteName}; ingredients should reflect this`);

  return parts.join("\n");
}

function brandPreamble(
  siteName: string,
  siteUrl: string,
  playbook: BrandPlaybook | null,
  brandVoice: Record<string, unknown>,
): string {
  const parts: string[] = [];
  parts.push("## Brand context");
  parts.push(`Site: ${siteName} (${siteUrl})`);
  if (playbook) {
    const angle = playbook.brandPositioning?.selectedAngles?.[0];
    const lang = playbook.audienceResearch?.languageMap;
    if (angle) {
      parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
      parts.push(`Tone: ${angle.tone || "engaging"}`);
    }
    if (playbook.offerCore?.offerStatement?.emotionalCore) {
      parts.push(`Emotional core: ${playbook.offerCore.offerStatement.emotionalCore}`);
    }
    if (lang) {
      if (lang.painPhrases?.length) parts.push(`Pain phrases: ${lang.painPhrases.join(", ")}`);
      if (lang.desirePhrases?.length) parts.push(`Desire phrases: ${lang.desirePhrases.join(", ")}`);
      if (lang.emotionalTriggers?.length) parts.push(`Emotional triggers: ${lang.emotionalTriggers.join(", ")}`);
    }
  } else {
    if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
    if (Array.isArray(brandVoice.keywords)) parts.push(`Keywords: ${(brandVoice.keywords as string[]).join(", ")}`);
    if (Array.isArray(brandVoice.avoid)) parts.push(`Avoid: ${(brandVoice.avoid as string[]).join(", ")}`);
  }
  return parts.join("\n");
}
