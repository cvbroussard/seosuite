import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

interface SuggestedTags {
  pillarId: string;
  tagIds: string[];
}

/**
 * AI-suggest content tags from a context note.
 * Reads the site's pillar_config and returns 3-5 matching tags.
 * Fast Haiku call — designed for real-time use during upload.
 */
export async function suggestTags(
  siteId: string,
  contextNote: string
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

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    messages: [{
      role: "user",
      content: `Pick the best pillar and 2-4 tags for this content.

Context note: "${contextNote}"

Pillars and tags:
${tagMap.map((p) => `[${p.pillar}] ${p.pillarLabel}: ${p.description}\n  Tags: ${p.tags}`).join("\n\n")}

Return ONLY JSON, no markdown: {"pillar":"pillar_id","tags":["tag_id_1","tag_id_2"]}`,
    }],
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
