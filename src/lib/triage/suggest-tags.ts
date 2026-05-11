import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

interface SuggestedTags {
  pillarId: string;
  tagIds: string[];
}

/**
 * AI-suggest content tags from a context note + optional image.
 * Reads the site's pillar_config and returns 3-5 matching tags.
 * Fast Haiku call — designed for real-time use during upload.
 *
 * When imageUrl is provided, Haiku sees BOTH the transcript and the
 * image. This is the right architecture for Story Angle (editorial
 * framing) — vision genuinely informs which pillar fits because the
 * picture IS the story. (Vision was correctly rejected for brand
 * detection where varietal precision isn't a vision strength; story
 * framing is the opposite case.)
 */
export async function suggestTags(
  siteId: string,
  contextNote: string,
  imageUrl?: string,
): Promise<SuggestedTags> {
  if (!contextNote || contextNote.length < 5) {
    return { pillarId: "", tagIds: [] };
  }

  // Fetch pillar config
  const [site] = await sql`
    SELECT pillar_config FROM sites WHERE id = ${siteId}
  `;

  const config = (site?.pillar_config || []) as Array<{
    id: string;
    framework: string;
    label: string;
    description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  if (config.length === 0) {
    return { pillarId: "", tagIds: [] };
  }

  // Build compact tag list for the prompt
  const tagMap = config.map((p) => ({
    pillar: p.id,
    pillarLabel: p.label,
    description: p.description,
    tags: p.tags.map((t) => `${t.id}: ${t.label}`).join(", "),
  }));

  const promptText = `Pick the 3-5 most distinguishing tags for this content. Focus on what makes it specific — not everything it touches.

${imageUrl ? "You're shown an image AND a context note. Use BOTH signals — the visual content reveals what the asset depicts (finished result vs in-progress work, materials shown, people present, etc.); the text reveals subscriber's intent and supporting detail.\n\n" : ""}Context note: "${contextNote}"

Pillars and tags:
${tagMap.map((p) => `[${p.pillar}] ${p.pillarLabel}: ${p.description}\n  Tags: ${p.tags}`).join("\n\n")}

Rules:
- Pick the PRIMARY pillar (the one that best fits the overall content)
- Select 3-5 tags from ANY pillar that best distinguish this content from other content
- Match on substantive nouns (materials, brands, techniques, equipment) — ignore filler words and adjectives
- Prefer specific tags (a named vendor, a specific material) over broad ones (style, philosophy)

Return ONLY JSON, no markdown: {"pillar":"pillar_id","tags":["tag_id_1","tag_id_2","tag_id_3"]}`;

  // Build content blocks: image first if present (Anthropic recommends
  // image-before-text ordering for best multimodal attention), then text.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "url"; url: string } }
  > = [];
  if (imageUrl) {
    content.push({ type: "image", source: { type: "url", url: imageUrl } });
  }
  content.push({ type: "text", text: promptText });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    return {
      pillarId: result.pillar || "",
      tagIds: Array.isArray(result.tags) ? result.tags : [],
    };
  } catch {
    return { pillarId: "", tagIds: [] };
  }
}
