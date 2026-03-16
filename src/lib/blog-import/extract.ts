/**
 * Content extraction — fetches a blog post URL and uses Claude Haiku
 * to extract clean markdown content from arbitrary HTML layouts.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ExtractedPost {
  title: string;
  body: string; // markdown
  excerpt: string;
  featuredImageUrl: string | null;
  publishDate: string | null;
  tags: string[];
  metaDescription: string;
  imageUrls: string[]; // all images found for re-hosting
}

/**
 * Fetch a blog post URL and extract its content via Claude.
 */
export async function extractPostContent(url: string): Promise<ExtractedPost> {
  const html = await fetchPage(url);

  // Collect all image URLs before stripping HTML
  const imageUrls = extractImageUrls(html, url);

  // Extract the article portion to reduce token usage
  const content = isolateContent(html);

  // Check for SPA / empty content
  const textContent = content.replace(/<[^>]+>/g, "").trim();
  if (textContent.length < 100) {
    throw new Error(
      `Insufficient content extracted from ${url} — page may use client-side rendering`
    );
  }

  // Extract via Claude
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Extract the blog post content from the following HTML. Convert the article body to clean markdown (preserve headings, links, lists, bold/italic). Ignore navigation, sidebars, footers, comments, and ads.

Return ONLY valid JSON with these fields:
{
  "title": "The post title",
  "body": "Full article body in clean markdown with ## subheadings",
  "excerpt": "1-2 sentence summary",
  "featured_image_url": "URL of the hero/featured image, or null",
  "publish_date": "ISO date string if found, or null",
  "tags": ["tag1", "tag2"],
  "meta_description": "SEO meta description if found, or generate a good one"
}

HTML content from ${url}:

${content.slice(0, 30000)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON from Claude's response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse extraction response for ${url}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    title: parsed.title || "Untitled",
    body: parsed.body || "",
    excerpt: parsed.excerpt || "",
    featuredImageUrl: parsed.featured_image_url || null,
    publishDate: parsed.publish_date || null,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    metaDescription: parsed.meta_description || "",
    imageUrls,
  };
}

/**
 * Strip non-content HTML and isolate the article body.
 */
function isolateContent(html: string): string {
  let content = html;

  // Remove script, style, nav, footer, aside, header tags and their content
  const stripTags = [
    "script",
    "style",
    "nav",
    "footer",
    "aside",
    "noscript",
    "iframe",
  ];
  for (const tag of stripTags) {
    content = content.replace(
      new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi"),
      ""
    );
  }

  // Try to extract <article> or <main> content
  const articleMatch = content.match(
    /<article[\s>][\s\S]*?<\/article>/i
  );
  if (articleMatch) return articleMatch[0];

  const mainMatch = content.match(/<main[\s>][\s\S]*?<\/main>/i);
  if (mainMatch) return mainMatch[0];

  // Fall back to <body>
  const bodyMatch = content.match(/<body[\s>][\s\S]*?<\/body>/i);
  if (bodyMatch) return bodyMatch[0];

  return content;
}

/**
 * Extract all image URLs from HTML for re-hosting.
 */
function extractImageUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    // Skip data URIs, SVGs, and tracking pixels
    if (src.startsWith("data:")) continue;
    if (src.endsWith(".svg")) continue;
    if (src.includes("1x1") || src.includes("pixel")) continue;

    try {
      const resolved = new URL(src, pageUrl).href;
      urls.push(resolved);
    } catch {
      // Skip malformed URLs
    }
  }

  return [...new Set(urls)];
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "TracPost-Importer/1.0" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}
