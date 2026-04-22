import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PublishHub() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId}) AS total_assets,
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId} AND source = 'upload') AS uploads,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'published') AS published_articles,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'draft') AS draft_articles,
      (SELECT COUNT(*)::int FROM social_posts WHERE site_id = ${siteId} AND status = 'published') AS published_posts,
      (SELECT COUNT(*)::int FROM social_posts WHERE site_id = ${siteId} AND status = 'draft') AS draft_posts,
      (SELECT COUNT(*)::int FROM projects WHERE site_id = ${siteId}) AS projects
  `;

  const c = counts || {};
  const prefix = "/dashboard";

  const cards = [
    { label: "Capture", href: `${prefix}/capture`, desc: "Upload photos of your work", stat: `${c.uploads || 0} uploads`, statColor: "" },
    { label: "Media", href: `${prefix}/media`, desc: "Your asset library", stat: `${c.total_assets || 0} assets`, statColor: "" },
    { label: "Blog", href: `${prefix}/blog`, desc: "Published articles and drafts", stat: `${c.published_articles || 0} published`, statColor: "text-success" },
    { label: "Unipost", href: `${prefix}/unipost`, desc: "Social post drafts and publishing", stat: `${c.published_posts || 0} published`, statColor: "text-success" },
    { label: "Calendar", href: `${prefix}/calendar`, desc: "Content schedule", stat: "", statColor: "" },
    { label: "Photos", href: `${prefix}/google/photos`, desc: "Google Business photos", stat: "", statColor: "" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Publish</h1>
        <p className="text-xs text-muted">Your content — uploads, articles, social posts, and projects</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Tile label="Assets" value={c.total_assets || 0} sub={`${c.uploads || 0} uploads`} />
        <Tile label="Articles" value={c.published_articles || 0} sub={`${c.draft_articles || 0} drafts`} accent />
        <Tile label="Social Posts" value={c.published_posts || 0} sub={`${c.draft_posts || 0} drafts`} accent />
        <Tile label="Projects" value={c.projects || 0} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-xl border border-border bg-surface p-4 shadow-card hover:border-accent/30 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{card.label}</p>
                <p className="mt-0.5 text-[10px] text-muted">{card.desc}</p>
              </div>
              {card.stat && <span className={`text-xs font-medium ${card.statColor}`}>{card.stat}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
      <p className={`text-2xl font-semibold ${accent ? "text-success" : ""}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[10px] text-muted">{label}</p>
      {sub && <p className="text-[9px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
