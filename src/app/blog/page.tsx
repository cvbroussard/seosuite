import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveBlogSite, getBlogPosts, getAllBlogSites, checkDepartureRedirect } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";

  // Custom domain / subdomain — render single-site blog index
  const site = await resolveBlogSite(blogHost);
  const isTracpostHub = blogHost === "blog.tracpost.com";

  // Single-site mode (custom domain or subdomain)
  if (site && !isTracpostHub) {
    return renderSingleSiteIndex(site);
  }

  // Multi-site discovery on blog.tracpost.com
  if (isTracpostHub) {
    return renderDiscoveryIndex();
  }

  // No site found — check for departure redirect
  const redirectTarget = await checkDepartureRedirect(blogHost);
  if (redirectTarget) redirect(redirectTarget);

  return (
    <div style={{ padding: "80px 0", textAlign: "center" }}>
      <h1>Blog not found</h1>
      <p className="blog-muted" style={{ marginTop: 8 }}>This blog hasn&apos;t been configured yet.</p>
    </div>
  );
}

/**
 * Single-site blog index — for custom domains and subdomains.
 * Links point to /{siteSlug}/{articleSlug} on blog.tracpost.com,
 * but to /{articleSlug} on custom domains (middleware handles rewrite).
 */
async function renderSingleSiteIndex(site: { siteId: string; siteName: string; blogSlug: string; blogTitle: string; blogDescription: string }) {
  const posts = await getBlogPosts(site.siteId);
  const pillars = [...new Set(posts.map((p) => p.content_pillar as string).filter(Boolean))];
  const slug = site.blogSlug;

  return (
    <div>
      <header style={{ marginBottom: 48 }}>
        <h1>{site.blogTitle || site.siteName}</h1>
        {site.blogDescription && (
          <p className="blog-muted" style={{ marginTop: 8, fontSize: 17 }}>
            {site.blogDescription}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
          {pillars.map((pillar) => (
            <Link
              key={pillar}
              href={`/blog/pillar/${encodeURIComponent(pillar)}`}
              style={{
                fontSize: 13,
                padding: "4px 12px",
                borderRadius: "var(--blog-radius)",
                border: "1px solid var(--blog-border)",
                color: "var(--blog-muted)",
                textDecoration: "none",
              }}
            >
              {pillar}
            </Link>
          ))}
          <Link
            href={`/blog/${slug}/feed.xml`}
            style={{ fontSize: 13, color: "var(--blog-muted)", textDecoration: "none", marginLeft: "auto" }}
          >
            RSS
          </Link>
        </div>
      </header>

      {posts.length === 0 ? (
        <p className="blog-muted" style={{ padding: "48px 0", textAlign: "center" }}>
          No posts yet.
        </p>
      ) : (
        <div>
          {posts.map((post) => (
            <article
              key={String(post.id)}
              style={{ borderBottom: "1px solid var(--blog-border)", padding: "24px 0" }}
            >
              <Link href={`/blog/${slug}/${String(post.slug)}`} style={{ textDecoration: "none", color: "inherit" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>
                  {String(post.title)}
                </h2>
                {post.excerpt ? (
                  <p className="blog-muted" style={{ fontSize: 15, marginBottom: 8 }}>
                    {String(post.excerpt)}
                  </p>
                ) : null}
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                {post.published_at ? (
                  <time className="blog-muted">
                    {new Date(String(post.published_at)).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                ) : null}
                {post.content_pillar ? (
                  <Link
                    href={`/blog/pillar/${encodeURIComponent(String(post.content_pillar))}`}
                    className="blog-muted"
                    style={{ textDecoration: "none" }}
                  >
                    · {String(post.content_pillar)}
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-site discovery index — blog.tracpost.com homepage.
 * Shows all blog-enabled sites and their recent articles.
 */
async function renderDiscoveryIndex() {
  const sites = await getAllBlogSites();

  // Get recent posts across all sites
  const allPosts: Array<Record<string, unknown> & { siteSlug: string; siteName: string }> = [];
  for (const site of sites) {
    const posts = await getBlogPosts(site.siteId, 3);
    for (const post of posts) {
      allPosts.push({ ...post, siteSlug: site.blogSlug, siteName: site.siteName });
    }
  }
  allPosts.sort((a, b) => {
    const da = new Date(a.published_at as string).getTime();
    const db = new Date(b.published_at as string).getTime();
    return db - da;
  });
  const recentPosts = allPosts.slice(0, 20);

  return (
    <div>
      <header style={{ marginBottom: 48, textAlign: "center" }}>
        <h1 style={{ fontSize: 28 }}>Tracpost Blog</h1>
        <p className="blog-muted" style={{ marginTop: 8, fontSize: 17 }}>
          Stories from businesses powered by Tracpost
        </p>
        <Link
          href="/blog/feed.xml"
          style={{ fontSize: 13, color: "var(--blog-muted)", textDecoration: "none" }}
        >
          RSS
        </Link>
      </header>

      {/* Site directory */}
      {sites.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>Browse by Business</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sites.map((site) => (
              <Link
                key={site.siteId}
                href={`/blog/${site.blogSlug}`}
                style={{
                  fontSize: 14,
                  padding: "6px 14px",
                  borderRadius: "var(--blog-radius)",
                  border: "1px solid var(--blog-border)",
                  color: "var(--blog-text, #1a1a1a)",
                  textDecoration: "none",
                }}
              >
                {site.siteName}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent articles across all sites */}
      {recentPosts.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>Recent Articles</h2>
          <div>
            {recentPosts.map((post) => (
              <article
                key={String(post.id)}
                style={{ borderBottom: "1px solid var(--blog-border)", padding: "20px 0" }}
              >
                <Link
                  href={`/blog/${post.siteSlug}/${String(post.slug)}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px" }}>
                    {String(post.title)}
                  </h3>
                  {post.excerpt ? (
                    <p className="blog-muted" style={{ fontSize: 14, margin: "0 0 6px" }}>
                      {String(post.excerpt)}
                    </p>
                  ) : null}
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <Link
                    href={`/blog/${post.siteSlug}`}
                    className="blog-accent"
                    style={{ textDecoration: "none" }}
                  >
                    {post.siteName}
                  </Link>
                  {post.published_at ? (
                    <time className="blog-muted">
                      · {new Date(String(post.published_at)).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {sites.length === 0 && recentPosts.length === 0 && (
        <p className="blog-muted" style={{ padding: "48px 0", textAlign: "center" }}>
          No blogs published yet.
        </p>
      )}
    </div>
  );
}
