import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConfigureHub() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [siteRow, counts, platforms] = await Promise.all([
    sql`SELECT name, url, business_type, location, brand_playbook FROM sites WHERE id = ${siteId}`,
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM brands WHERE site_id = ${siteId}) AS brands,
        (SELECT COUNT(*)::int FROM projects WHERE site_id = ${siteId}) AS projects,
        (SELECT COUNT(*)::int FROM personas WHERE site_id = ${siteId}) AS personas,
        (SELECT COUNT(*)::int FROM locations WHERE site_id = ${siteId}) AS locations
    `,
    sql`
      SELECT sa.platform, sa.status
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
    `,
  ]);

  const site = siteRow[0];
  const c = counts[0] || {};
  const activeConnections = platforms.filter(p => p.status === "active").length;
  const hasPlaybook = !!(site?.brand_playbook as Record<string, unknown>)?.brandPositioning;
  const prefix = "/dashboard";

  const cards = [
    { label: "Brand", href: `${prefix}/brand`, desc: "Voice, playbook, and positioning", stat: hasPlaybook ? "Configured" : "Not set", statColor: hasPlaybook ? "text-success" : "text-warning" },
    { label: "Connections", href: `${prefix}/accounts`, desc: "Social accounts and OAuth", stat: `${activeConnections} active`, statColor: activeConnections > 0 ? "text-success" : "text-muted" },
    { label: "Google Profile", href: `${prefix}/google/profile`, desc: "GBP listing, categories, service area", stat: platforms.some(p => (p.platform as string) === "gbp") ? "Connected" : "Not connected", statColor: platforms.some(p => (p.platform as string) === "gbp") ? "text-success" : "text-warning" },
    { label: "Entities", href: `${prefix}/entities`, desc: "Brands, projects, personas, locations", stat: `${c.brands || 0} brands · ${c.projects || 0} projects`, statColor: "" },
    { label: "Settings", href: `${prefix}/settings`, desc: "Site configuration and preferences", stat: "", statColor: "" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Configure</h1>
        <p className="text-xs text-muted">Set up your business identity, connections, and preferences</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Connections" value={activeConnections} sub={`${platforms.length} total`} />
        <Tile label="Entities" value={(c.brands as number || 0) + (c.projects as number || 0) + (c.personas as number || 0)} sub="brands + projects + personas" />
        <Tile label="Playbook" value={hasPlaybook ? "Ready" : "Pending"} accent={hasPlaybook} />
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
