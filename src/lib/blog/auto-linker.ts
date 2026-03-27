import { sql } from "@/lib/db";

interface LinkablePost {
  slug: string;
  title: string;
  tags: string[];
}

/**
 * Fetch all other published posts for a site (excluding the current one).
 */
async function getRelatedPosts(
  siteId: string,
  excludeSlug: string
): Promise<LinkablePost[]> {
  const rows = await sql`
    SELECT slug, title, tags
    FROM blog_posts
    WHERE site_id = ${siteId}
      AND status = 'published'
      AND slug != ${excludeSlug}
    ORDER BY published_at DESC
  `;
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  }));
}

/**
 * Build a map of matchable phrases → link targets.
 * Longer phrases take priority to avoid partial matches.
 */
function buildPhraseMap(
  posts: LinkablePost[],
  siteSlug: string
): Array<{ phrase: string; href: string; title: string }> {
  const entries: Array<{ phrase: string; href: string; title: string }> = [];

  for (const post of posts) {
    const href = `/blog/${siteSlug}/${post.slug}`;

    // Add the title as a matchable phrase
    entries.push({ phrase: post.title, href, title: post.title });

    // Add each tag as a matchable phrase
    for (const tag of post.tags) {
      if (tag.length >= 4) {
        entries.push({ phrase: tag, href, title: post.title });
      }
    }
  }

  // Sort by phrase length descending — match longest phrases first
  entries.sort((a, b) => b.phrase.length - a.phrase.length);

  return entries;
}

/**
 * Auto-link entity mentions in HTML to related blog posts.
 *
 * Scans the rendered HTML for phrases matching other posts' titles and tags.
 * Links only the first occurrence of each match. Skips content already
 * inside <a>, <h1>, <h2>, <h3> tags to avoid nested links or header disruption.
 */
export async function autoLinkEntities(
  html: string,
  siteId: string,
  siteSlug: string,
  currentSlug: string
): Promise<string> {
  const posts = await getRelatedPosts(siteId, currentSlug);
  if (posts.length === 0) return html;

  const phraseMap = buildPhraseMap(posts, siteSlug);
  const linked = new Set<string>(); // track which hrefs we've already linked
  let result = html;

  for (const { phrase, href, title } of phraseMap) {
    if (linked.has(href)) continue;

    // Case-insensitive match for the phrase, but only in paragraph/list text
    // Avoid matching inside existing tags or headings
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?<![<\\/a-zA-Z])\\b(${escaped})\\b(?![^<]*<\\/a>)(?![^<]*<\\/h[1-3]>)`,
      "i"
    );

    const match = result.match(pattern);
    if (match && match.index !== undefined) {
      // Verify we're not inside an <a> or heading tag
      const before = result.slice(0, match.index);
      const lastOpenA = before.lastIndexOf("<a ");
      const lastCloseA = before.lastIndexOf("</a>");
      const lastOpenH = Math.max(
        before.lastIndexOf("<h1"),
        before.lastIndexOf("<h2"),
        before.lastIndexOf("<h3")
      );
      const lastCloseH = Math.max(
        before.lastIndexOf("</h1>"),
        before.lastIndexOf("</h2>"),
        before.lastIndexOf("</h3>")
      );

      const insideLink = lastOpenA > lastCloseA;
      const insideHeading = lastOpenH > lastCloseH;

      if (!insideLink && !insideHeading) {
        const matchedText = match[1];
        const link = `<a href="${href}" title="${title.replace(/"/g, "&quot;")}">${matchedText}</a>`;
        result =
          result.slice(0, match.index) +
          link +
          result.slice(match.index + matchedText.length);
        linked.add(href);
      }
    }
  }

  return result;
}
