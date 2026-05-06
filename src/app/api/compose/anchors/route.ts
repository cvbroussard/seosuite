import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/compose/anchors
 *
 * Returns the active site's anchor pool — the published blog articles
 * and active/complete projects that a Compose post can point at.
 *
 * Each anchor carries its own URL on the subscriber's site, a hero
 * thumbnail, content pillar tag, and a usage count (how many times
 * the anchor has been used as a link target by past social posts —
 * inferred from social_posts.link_url containing the anchor's slug).
 *
 * The picker is the new Step 1 of the anchor-first Compose wizard
 * (per project_tracpost_anchor_first_compose.md). Subscriber-facing
 * label is "Topic"; the internal/architectural term is "anchor".
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  // Site URL becomes the URL prefix for anchor links.
  const [siteRow] = await sql`SELECT url FROM sites WHERE id = ${siteId}`;
  const siteUrl = (siteRow?.url as string | null)?.replace(/\/+$/, "") || "";

  // Blog articles: published only.
  const blogPosts = await sql`
    SELECT b.id, b.slug, b.title, b.excerpt, b.content_pillar,
           b.published_at, b.og_image_url,
           ma.storage_url AS source_asset_url
    FROM blog_posts b
    LEFT JOIN media_assets ma ON ma.id = b.source_asset_id
    WHERE b.site_id = ${siteId}
      AND b.status = 'published'
    ORDER BY b.published_at DESC NULLS LAST
  `;

  // Projects: active or complete.
  const projects = await sql`
    SELECT p.id, p.slug, p.name AS title, p.description AS excerpt,
           p.status, p.start_date, p.end_date,
           ma.storage_url AS hero_url
    FROM projects p
    LEFT JOIN media_assets ma ON ma.id = p.hero_asset_id
    WHERE p.site_id = ${siteId}
      AND p.status IN ('active', 'complete')
    ORDER BY COALESCE(p.end_date, p.start_date, p.created_at) DESC NULLS LAST
  `;

  // Usage count per slug — inferred from past social_posts.link_url.
  // Works without any schema change; not perfect (different anchors with
  // similar slugs could collide) but a useful first signal. Once
  // social_posts.metadata.anchor_id is populated by future Compose
  // sessions, switch to that for precision.
  const allSlugs = [
    ...blogPosts.map((b) => b.slug as string),
    ...projects.map((p) => p.slug as string),
  ];
  const usageCounts = new Map<string, number>();
  if (allSlugs.length > 0) {
    const usageRows = await sql`
      SELECT sp.link_url
      FROM social_posts sp
      JOIN social_accounts sa ON sa.id = sp.account_id
      WHERE sa.subscription_id = ${session.subscriptionId}
        AND sp.link_url IS NOT NULL
    `;
    for (const row of usageRows) {
      const url = String(row.link_url || "");
      for (const slug of allSlugs) {
        if (url.includes(`/${slug}`)) {
          usageCounts.set(slug, (usageCounts.get(slug) || 0) + 1);
        }
      }
    }
  }

  const anchors = [
    ...blogPosts.map((b) => ({
      id: b.id as string,
      type: "blog_post" as const,
      title: b.title as string,
      slug: b.slug as string,
      contentPillar: (b.content_pillar as string | null) || null,
      heroUrl: (b.og_image_url as string | null) || (b.source_asset_url as string | null) || null,
      excerpt: (b.excerpt as string | null) || null,
      publishedAt: b.published_at as string | null,
      usedCount: usageCounts.get(b.slug as string) || 0,
      url: siteUrl ? `${siteUrl}/blog/${b.slug}` : `/blog/${b.slug}`,
    })),
    ...projects.map((p) => ({
      id: p.id as string,
      type: "project" as const,
      title: p.title as string,
      slug: p.slug as string,
      contentPillar: null,
      heroUrl: (p.hero_url as string | null) || null,
      excerpt: (p.excerpt as string | null) || null,
      publishedAt: (p.end_date as string | null) || (p.start_date as string | null) || null,
      usedCount: usageCounts.get(p.slug as string) || 0,
      url: siteUrl ? `${siteUrl}/projects/${p.slug}` : `/projects/${p.slug}`,
    })),
  ];

  return NextResponse.json({ anchors, totalCount: anchors.length });
}
