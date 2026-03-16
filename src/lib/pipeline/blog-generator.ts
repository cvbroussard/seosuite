import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

const anthropic = new Anthropic();

/**
 * Generate a blog post from a triaged media asset.
 *
 * If the site has a brand playbook, uses the full AI-native SEO spec:
 * voice fusion, embedding coherence, semantic chunking, monosemanticity,
 * query-aligned headings, FAQ generation, and key takeaways.
 *
 * Falls back to the basic prompt if no playbook exists.
 */
export async function generateBlogPost(assetId: string): Promise<string | null> {
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.context_note,
           ma.content_pillar, ma.ai_analysis, ma.media_type,
           s.name AS site_name, s.url AS site_url, s.brand_voice,
           s.brand_playbook,
           bs.blog_enabled, bs.blog_title
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if (!asset.blog_enabled) return null;

  const [existing] = await sql`
    SELECT id FROM blog_posts WHERE source_asset_id = ${assetId}
  `;
  if (existing) return existing.id;

  const playbook = asset.brand_playbook as BrandPlaybook | null;
  const brandVoice = (asset.brand_voice || {}) as Record<string, unknown>;
  const aiAnalysis = (asset.ai_analysis || {}) as Record<string, unknown>;

  // If playbook exists, pull a hook from the bank for this post
  let hookText: string | undefined;
  if (playbook) {
    const [hook] = await sql`
      SELECT text FROM hook_bank
      WHERE site_id = ${asset.site_id}
      ORDER BY
        CASE rating WHEN 'loved' THEN 0 ELSE 1 END,
        used_count ASC, RANDOM()
      LIMIT 1
    `;
    if (hook) {
      hookText = hook.text;
      await sql`
        UPDATE hook_bank SET used_count = used_count + 1, last_used_at = NOW()
        WHERE site_id = ${asset.site_id} AND text = ${hook.text}
      `;
    }
  }

  const prompt = playbook
    ? buildPlaybookBlogPrompt(asset, playbook, aiAnalysis, hookText)
    : buildBasicBlogPrompt(asset, brandVoice, aiAnalysis);

  const response = await anthropic.messages.create({
    model: playbook ? "claude-sonnet-4-5-20250514" : "claude-haiku-4-5-20251001",
    max_tokens: playbook ? 6144 : 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseBlogResponse(text);

  const slug = generateSlug(parsed.title);

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, source_asset_id, slug, title, body, excerpt,
      meta_title, meta_description, og_image_url, schema_json,
      tags, content_pillar, status
    ) VALUES (
      ${asset.site_id}, ${assetId}, ${slug}, ${parsed.title},
      ${parsed.body}, ${parsed.excerpt},
      ${parsed.meta_title || parsed.title},
      ${parsed.meta_description || parsed.excerpt},
      ${asset.storage_url},
      ${JSON.stringify(buildArticleSchema(parsed, asset))},
      ${parsed.tags}, ${asset.content_pillar || null},
      'draft'
    )
    RETURNING id
  `;

  return post.id;
}

/**
 * Generate a blog post from a content topic (playbook-driven).
 * Pulls from content_topics queue instead of media assets.
 */
export async function generateBlogFromTopic(topicId: string): Promise<string | null> {
  const [topic] = await sql`
    SELECT ct.id, ct.site_id, ct.title AS topic_title, ct.search_query,
           ct.intent, ct.pillar, ct.cluster,
           s.name AS site_name, s.url AS site_url, s.brand_playbook
    FROM content_topics ct
    JOIN sites s ON ct.site_id = s.id
    WHERE ct.id = ${topicId} AND ct.status = 'queued'
  `;

  if (!topic) return null;

  const playbook = topic.brand_playbook as BrandPlaybook | null;
  if (!playbook) return null;

  // Pull a hook
  let hookText: string | undefined;
  const [hook] = await sql`
    SELECT text FROM hook_bank
    WHERE site_id = ${topic.site_id}
    ORDER BY CASE rating WHEN 'loved' THEN 0 ELSE 1 END, used_count ASC, RANDOM()
    LIMIT 1
  `;
  if (hook) {
    hookText = hook.text;
    await sql`
      UPDATE hook_bank SET used_count = used_count + 1, last_used_at = NOW()
      WHERE site_id = ${topic.site_id} AND text = ${hook.text}
    `;
  }

  const prompt = buildTopicBlogPrompt(topic, playbook, hookText);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 6144,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseBlogResponse(text);
  const slug = generateSlug(parsed.title);

  // Check blog_enabled
  const [settings] = await sql`
    SELECT blog_enabled FROM blog_settings WHERE site_id = ${topic.site_id}
  `;
  if (!settings?.blog_enabled) return null;

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, slug, title, body, excerpt,
      meta_title, meta_description, schema_json,
      tags, content_pillar, status
    ) VALUES (
      ${topic.site_id}, ${slug}, ${parsed.title},
      ${parsed.body}, ${parsed.excerpt},
      ${parsed.meta_title || parsed.title},
      ${parsed.meta_description || parsed.excerpt},
      ${JSON.stringify(buildTopicArticleSchema(parsed, topic))},
      ${parsed.tags}, ${topic.pillar || null},
      'draft'
    )
    RETURNING id
  `;

  // Link topic to post
  await sql`
    UPDATE content_topics
    SET status = 'generated', blog_post_id = ${post.id}
    WHERE id = ${topicId}
  `;

  return post.id;
}

/**
 * Generate blog posts for all recently triaged assets that don't have one yet.
 */
export async function generateMissingBlogPosts(siteId: string): Promise<number> {
  const [settings] = await sql`
    SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}
  `;
  if (!settings?.blog_enabled) return 0;

  const assets = await sql`
    SELECT ma.id
    FROM media_assets ma
    LEFT JOIN blog_posts bp ON bp.source_asset_id = ma.id
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status IN ('triaged', 'scheduled', 'consumed')
      AND bp.id IS NULL
    ORDER BY ma.created_at DESC
    LIMIT 5
  `;

  let generated = 0;
  for (const asset of assets) {
    try {
      const postId = await generateBlogPost(asset.id);
      if (postId) generated++;
    } catch (err) {
      console.error(
        `Blog generation failed for asset ${asset.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return generated;
}

// ── AI-Native SEO Blog Prompt (Playbook-Driven) ───────────────────

function buildPlaybookBlogPrompt(
  asset: Record<string, unknown>,
  playbook: BrandPlaybook,
  aiAnalysis: Record<string, unknown>,
  hookText?: string
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;

  return `In [2,000] words, write a comprehensive, authoritative, and semantically optimized article.

## Content Source
Content pillar: ${asset.content_pillar || "general"}
${asset.context_note ? `Creator's note: "${asset.context_note}"` : ""}
${aiAnalysis.description ? `Visual context: ${aiAnalysis.description}` : ""}
${hookText ? `Opening hook to weave in: "${hookText}"` : ""}

## Brand Context
Business: ${asset.site_name} (${asset.site_url})
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Tone: ${angle?.tone || "professional, engaging"}
Offer: ${offerCore.offerStatement.emotionalCore}

## Audience Intelligence
Current state: ${audienceResearch.transformationJourney.currentState.slice(0, 300)}
Desired state: ${audienceResearch.transformationJourney.desiredState.slice(0, 300)}
Pain phrases (use their language): ${lang.painPhrases.join(", ")}
Desire phrases (use their language): ${lang.desirePhrases.join(", ")}
Search phrases (optimize for): ${lang.searchPhrases.join(", ")}
Emotional triggers: ${lang.emotionalTriggers.join(", ")}

## Core Writing Instructions

1) Writing Style: Synthesize two contrasting voices:

Voice 1 (Structured Authority): Organized arguments, analogy-rich storytelling, humble yet deeply insightful, Socratic and reflective, human-centered and meticulous.

Voice 2 (Sharp Conversational): Provocative, candid, witty. Boldly honest in assessing flaws. Sharp metaphors and analogies. Conversational and direct, no jargon.

Fusion: Lead paragraphs with vivid anecdotes or provocative metaphors, follow immediately with structured analysis. Blend humility with intellectual confidence. Maintain 9th-grade reading level — accessible without dumbing down.

2) Embedding Coherence: Optimize for semantic similarity to real search queries. Naturally integrate the audience's pain phrases, desire phrases, and search phrases. Paragraphs should anchor key entities with clarity and repetition.

3) Semantic Chunking: Each paragraph must be a dense, contextually complete semantic unit ideal for LLM indexing. Never break an idea across multiple fragments.

4) Monosemanticity: Identify and implicitly define key entities. Ensure clear, consistent, unambiguous definitions throughout.

5) Headings: Use descriptive, query-aligned headings matching real search prompts. Include 2-3 headings phrased as direct questions (e.g., "What is X?", "How Does X Affect Y?").

6) Paragraph-First: Bullet points only when absolutely necessary. Prefer cohesive paragraph exposition with embedded entities and strong transitions.

## Response Format
Respond with ONLY valid JSON (no markdown fencing):
{
  "title": "<engaging, SEO-optimized, 50-70 characters>",
  "body": "<2000-word markdown article with ## headings, following all instructions above. End with ## Frequently Asked Questions section (5-7 Q&As optimized for LLM retrieval) and ## Key Takeaways section (5-7 bold, punchy, actionable statements)>",
  "excerpt": "<1-2 sentence summary for previews>",
  "meta_title": "<max 65 characters, semantic clarity for AI retrieval>",
  "meta_description": "<max 155 characters, entity-salient, topically precise>",
  "tags": ["<5-7 tags matching search intent>"]
}`;
}

// ── Topic-Driven Blog Prompt ───────────────────────────────────────

function buildTopicBlogPrompt(
  topic: Record<string, unknown>,
  playbook: BrandPlaybook,
  hookText?: string
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;

  return `In [2,000] words, write a comprehensive, authoritative, and semantically optimized article about **${topic.topic_title}**.

## Topic Context
Target search query: "${topic.search_query}"
Search intent: ${topic.intent}
Content pillar: ${topic.pillar || "general"}
Topic cluster: ${topic.cluster || "general"}
${hookText ? `Opening hook to weave in: "${hookText}"` : ""}

## Brand Context
Business: ${topic.site_name} (${topic.site_url})
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Tone: ${angle?.tone || "professional, engaging"}
Offer: ${offerCore.offerStatement.emotionalCore}

## Audience Intelligence
Current state: ${audienceResearch.transformationJourney.currentState.slice(0, 300)}
Desired state: ${audienceResearch.transformationJourney.desiredState.slice(0, 300)}
Pain phrases (use their language): ${lang.painPhrases.join(", ")}
Desire phrases (use their language): ${lang.desirePhrases.join(", ")}
Search phrases (optimize for): ${lang.searchPhrases.join(", ")}
Emotional triggers: ${lang.emotionalTriggers.join(", ")}

## Failed Solutions the Audience Has Tried
${audienceResearch.urgencyGateway.failedSolutions.join("\n")}

## Core Writing Instructions

1) Writing Style: Synthesize two contrasting voices:

Voice 1 (Structured Authority): Organized arguments, analogy-rich storytelling, humble yet deeply insightful, Socratic and reflective, human-centered and meticulous.

Voice 2 (Sharp Conversational): Provocative, candid, witty. Boldly honest in assessing flaws. Sharp metaphors and analogies. Conversational and direct, no jargon.

Fusion: Lead paragraphs with vivid anecdotes or provocative metaphors, follow immediately with structured analysis. Blend humility with intellectual confidence. Maintain 9th-grade reading level — accessible without dumbing down.

2) Embedding Coherence: Optimize for semantic similarity to the target search query "${topic.search_query}". Naturally integrate the audience's language patterns. Paragraphs should anchor key entities with clarity and repetition.

3) Semantic Chunking: Each paragraph must be a dense, contextually complete semantic unit ideal for LLM indexing. Never break an idea across multiple fragments.

4) Monosemanticity: Identify and implicitly define key entities. Ensure clear, consistent, unambiguous definitions throughout.

5) Headings: Use descriptive, query-aligned headings matching real search prompts. Include 2-3 headings phrased as direct questions.

6) Paragraph-First: Bullet points only when absolutely necessary. Prefer cohesive paragraph exposition.

## Response Format
Respond with ONLY valid JSON (no markdown fencing):
{
  "title": "<engaging, SEO-optimized, 50-70 characters>",
  "body": "<2000-word markdown article with ## headings. End with ## Frequently Asked Questions section (5-7 Q&As optimized for LLM retrieval, questions matching conversational prompts to LLMs) and ## Key Takeaways section (5-7 bold, punchy, actionable statements)>",
  "excerpt": "<1-2 sentence summary for previews>",
  "meta_title": "<max 65 characters, semantic clarity for AI retrieval>",
  "meta_description": "<max 155 characters, entity-salient, topically precise>",
  "tags": ["<5-7 tags matching search intent>"]
}`;
}

// ── Basic Blog Prompt (No Playbook) ────────────────────────────────

function buildBasicBlogPrompt(
  asset: Record<string, unknown>,
  brandVoice: Record<string, unknown>,
  aiAnalysis: Record<string, unknown>
): string {
  const parts: string[] = [];

  parts.push("You are a professional blog content writer. Generate a blog post based on a piece of visual content.");
  parts.push("");
  parts.push("## Brand");
  parts.push(`Business: ${asset.site_name} (${asset.site_url})`);
  if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
  if (brandVoice.keywords) parts.push(`Keywords to weave in: ${(brandVoice.keywords as string[]).join(", ")}`);

  parts.push("");
  parts.push("## Content Source");
  parts.push(`Content pillar: ${asset.content_pillar || "general"}`);
  if (asset.context_note) parts.push(`Creator's note: "${asset.context_note}"`);
  if (aiAnalysis.description) parts.push(`Image description: ${aiAnalysis.description}`);
  if (aiAnalysis.quality_notes) parts.push(`Quality: ${aiAnalysis.quality_notes}`);

  parts.push("");
  parts.push("## Requirements");
  parts.push("- Title: engaging, SEO-friendly, 50-70 characters");
  parts.push("- Body: 300-600 words with 2-3 subheadings (## Heading)");
  parts.push("- Write in a way that tells a story or provides value, not just describes the image");
  parts.push("- Include a call-to-action at the end");
  parts.push("- Excerpt: 1-2 sentence summary for previews");
  parts.push("- Meta description: 150-160 characters for SEO");

  parts.push("");
  parts.push("## Response Format");
  parts.push("Respond with ONLY valid JSON (no markdown fencing):");
  parts.push("{");
  parts.push('  "title": "...",');
  parts.push('  "body": "... (markdown with ## headings) ...",');
  parts.push('  "excerpt": "...",');
  parts.push('  "meta_title": "...",');
  parts.push('  "meta_description": "...",');
  parts.push('  "tags": ["tag1", "tag2", "tag3"]');
  parts.push("}");

  return parts.join("\n");
}

// ── Shared Helpers ─────────────────────────────────────────────────

function parseBlogResponse(text: string): {
  title: string;
  body: string;
  excerpt: string;
  meta_title?: string;
  meta_description?: string;
  tags: string[];
} {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "Untitled"),
      body: String(parsed.body || ""),
      excerpt: String(parsed.excerpt || ""),
      meta_title: parsed.meta_title ? String(parsed.meta_title) : undefined,
      meta_description: parsed.meta_description ? String(parsed.meta_description) : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch {
    return {
      title: "Untitled Post",
      body: text,
      excerpt: text.slice(0, 200),
      tags: [],
    };
  }
}

function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) + `-${Date.now().toString(36)}`
  );
}

function buildArticleSchema(
  post: { title: string; body: string; excerpt: string; meta_description?: string },
  asset: Record<string, unknown>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    image: asset.storage_url,
    author: {
      "@type": "Organization",
      name: asset.site_name,
      url: asset.site_url,
    },
    publisher: {
      "@type": "Organization",
      name: asset.site_name,
    },
    datePublished: new Date().toISOString(),
    wordCount: post.body.split(/\s+/).length,
  };
}

function buildTopicArticleSchema(
  post: { title: string; body: string; excerpt: string; meta_description?: string },
  topic: Record<string, unknown>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    author: {
      "@type": "Organization",
      name: topic.site_name,
      url: topic.site_url,
    },
    publisher: {
      "@type": "Organization",
      name: topic.site_name,
    },
    datePublished: new Date().toISOString(),
    wordCount: post.body.split(/\s+/).length,
  };
}
