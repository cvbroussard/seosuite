import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function QuantifyHub() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [scoreSummary, searchSummary] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS pages,
        ROUND(AVG(performance))::int AS avg_perf,
        ROUND(AVG(seo))::int AS avg_seo,
        ROUND(AVG(accessibility))::int AS avg_a11y
      FROM page_scores
      WHERE site_id = ${siteId}
    `,
    sql`
      SELECT
        COALESCE(SUM(impressions), 0)::int AS impressions,
        COALESCE(SUM(clicks), 0)::int AS clicks
      FROM search_performance
      WHERE site_id = ${siteId}
        AND date >= (CURRENT_DATE - INTERVAL '28 days')
    `,
  ]);

  const scores = scoreSummary[0] || {};
  const search = searchSummary[0] || {};
  const prefix = "/dashboard";

  function scoreColor(s: number): string {
    if (s >= 90) return "text-success";
    if (s >= 50) return "text-warning";
    return "text-danger";
  }

  const cards = [
    { label: "Analytics", href: `${prefix}/analytics`, desc: "Website traffic, acquisition, engagement, audience, conversions", stat: "GA4", statColor: "text-accent" },
    { label: "SEO", href: `${prefix}/seo`, desc: "Page scores, search queries, and site health", stat: (scores.pages as number) > 0 ? `${scores.avg_seo} avg` : "No data", statColor: (scores.pages as number) > 0 ? scoreColor(scores.avg_seo as number) : "text-muted" },
    { label: "GBP Performance", href: `${prefix}/google/performance`, desc: "Search impressions, maps views, customer actions", stat: "", statColor: "" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Quantify</h1>
        <p className="text-xs text-muted">How your content performs — analytics, SEO scores, and search visibility</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className={`text-2xl font-semibold ${(scores.pages as number) > 0 ? scoreColor(scores.avg_seo as number) : ""}`}>
            {(scores.pages as number) > 0 ? scores.avg_seo : "—"}
          </p>
          <p className="text-[10px] text-muted">SEO Score</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className={`text-2xl font-semibold ${(scores.pages as number) > 0 ? scoreColor(scores.avg_perf as number) : ""}`}>
            {(scores.pages as number) > 0 ? scores.avg_perf : "—"}
          </p>
          <p className="text-[10px] text-muted">Performance</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className="text-2xl font-semibold text-accent">{(search.clicks as number || 0).toLocaleString()}</p>
          <p className="text-[10px] text-muted">Search Clicks (28d)</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
          <p className="text-2xl font-semibold">{(search.impressions as number || 0).toLocaleString()}</p>
          <p className="text-[10px] text-muted">Impressions (28d)</p>
        </div>
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
