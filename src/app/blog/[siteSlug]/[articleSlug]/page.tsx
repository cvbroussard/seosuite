import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSiteBySlug, resolveBlogSite, getBlogPost } from "@/lib/blog";
import { generateArticleSchema } from "@/lib/blog/schema";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string; articleSlug: string }>;
}

/**
 * Resolve the site — try by slug first (multi-tenant hub),
 * fall back to hostname resolution (custom domain / subdomain).
 */
async function resolveSite(siteSlug: string) {
  const bySlug = await resolveBlogSiteBySlug(siteSlug);
  if (bySlug) return bySlug;

  // Fallback: if accessed via custom domain, resolve by hostname
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  return resolveBlogSite(blogHost);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug, articleSlug } = await params;
  const site = await resolveSite(siteSlug);
  if (!site) return {};

  const p = await getBlogPost(site.siteId, articleSlug);
  if (!p) return {};

  const row = p as Record<string, unknown>;
  const metaTitle = String(row.meta_title || row.title || "");
  const metaDesc = String(row.meta_description || row.excerpt || "");
  const canonicalUrl = `https://blog.tracpost.com/${siteSlug}/${articleSlug}`;

  return {
    title: metaTitle,
    description: metaDesc,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: metaTitle,
      description: metaDesc,
      url: canonicalUrl,
      images: row.og_image_url ? [String(row.og_image_url)] : undefined,
      type: "article",
      publishedTime: row.published_at ? String(row.published_at) : undefined,
      section: row.content_pillar ? String(row.content_pillar) : undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { siteSlug, articleSlug } = await params;
  const site = await resolveSite(siteSlug);
  if (!site) notFound();

  const postRow = await getBlogPost(site.siteId, articleSlug);
  if (!postRow) notFound();

  const post = postRow as Record<string, unknown>;
  const title = String(post.title || "");
  const body = String(post.body || "");
  const excerpt = String(post.excerpt || "");
  const ogImage = post.og_image_url ? String(post.og_image_url) : null;
  const publishedAt = post.published_at ? String(post.published_at) : null;
  const pillar = post.content_pillar ? String(post.content_pillar) : null;
  const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];

  const schema = generateArticleSchema({
    title,
    excerpt,
    ogImageUrl: ogImage,
    publishedAt,
    updatedAt: post.updated_at ? String(post.updated_at) : null,
    tags,
    siteSlug,
    articleSlug,
    siteName: site.siteName,
  });

  return (
    <article>
      {/* JSON-LD schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <Link
        href={`/blog/${siteSlug}`}
        className="blog-muted"
        style={{ fontSize: 14, textDecoration: "none", display: "inline-block", marginBottom: 32 }}
      >
        &larr; {site.siteName}
      </Link>

      <header style={{ marginBottom: 32 }}>
        <h1 style={{ marginBottom: 12 }}>{title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
          <span className="blog-muted">By {site.siteName}</span>
          {publishedAt && (
            <>
              <span className="blog-muted">·</span>
              <time className="blog-muted">
                {new Date(publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </>
          )}
          {pillar && (
            <>
              <span className="blog-muted">·</span>
              <Link
                href={`/blog/pillar/${encodeURIComponent(pillar)}`}
                className="blog-accent"
                style={{ textDecoration: "none", fontSize: 14 }}
              >
                {pillar}
              </Link>
            </>
          )}
        </div>
      </header>

      {ogImage && (
        <img
          src={ogImage}
          alt={title}
          style={{
            width: "100%",
            borderRadius: "var(--blog-radius)",
            marginBottom: 32,
          }}
        />
      )}

      {/* Blog body */}
      <div
        className="blog-prose"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
      />

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--blog-border)" }}>
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog/tag/${encodeURIComponent(tag)}`}
              style={{
                fontSize: 13,
                padding: "4px 12px",
                borderRadius: "var(--blog-radius)",
                border: "1px solid var(--blog-border)",
                color: "var(--blog-muted)",
                textDecoration: "none",
              }}
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * Markdown→HTML converter for blog body content.
 */
function markdownToHtml(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<img")) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}
