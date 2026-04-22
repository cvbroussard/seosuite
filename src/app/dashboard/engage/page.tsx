import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EngageHub() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [inboxCounts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM inbox_comments WHERE site_id = ${siteId}) AS comments,
      (SELECT COUNT(*)::int FROM inbox_reviews WHERE site_id = ${siteId}) AS reviews,
      (SELECT COUNT(*)::int FROM inbox_reviews WHERE site_id = ${siteId} AND reply_status = 'pending') AS pending_replies,
      (SELECT COUNT(*)::int FROM spotlight_sessions WHERE site_id = ${siteId}) AS spotlight_sessions
  `;

  const c = inboxCounts || {};
  const prefix = "/dashboard";

  const cards = [
    { label: "Inbox", href: `${prefix}/inbox`, desc: "Comments and messages from all platforms", stat: `${c.comments || 0} comments`, statColor: "" },
    { label: "Reviews", href: `${prefix}/google/reviews`, desc: "Google Business reviews and AI-drafted replies", stat: (c.pending_replies as number) > 0 ? `${c.pending_replies} pending` : `${c.reviews || 0} total`, statColor: (c.pending_replies as number) > 0 ? "text-warning" : "" },
    { label: "Spotlight", href: `${prefix}/spotlight`, desc: "In-store social proof and review capture", stat: `${c.spotlight_sessions || 0} sessions`, statColor: "" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Engage</h1>
        <p className="text-xs text-muted">Customer interactions — reviews, comments, messages, and social proof</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Reviews" value={c.reviews || 0} sub={(c.pending_replies as number) > 0 ? `${c.pending_replies} need reply` : "all replied"} accent={(c.pending_replies as number) > 0} />
        <Tile label="Comments" value={c.comments || 0} />
        <Tile label="Spotlight Sessions" value={c.spotlight_sessions || 0} />
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
      <p className={`text-2xl font-semibold ${accent ? "text-warning" : ""}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[10px] text-muted">{label}</p>
      {sub && <p className="text-[9px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
