/**
 * Coaching content lobby — operator landing page for managing the
 * per-platform coaching walkthroughs that drive the connection wizard
 * during onboarding. Each platform tile shows node count, terminal
 * status, and how many subscribers have started/completed it.
 */
import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const PLATFORMS = [
  { key: "meta", name: "Meta (Facebook + Instagram)" },
  { key: "gbp", name: "Google Business Profile" },
  { key: "linkedin", name: "LinkedIn" },
  { key: "youtube", name: "YouTube" },
  { key: "pinterest", name: "Pinterest" },
  { key: "tiktok", name: "TikTok" },
  { key: "twitter", name: "Twitter / X" },
];

interface WalkthroughStat {
  platform: string;
  title: string | null;
  node_count: number;
  has_terminal: boolean;
  starts: number;
  completes: number;
}

async function loadStats(): Promise<Record<string, WalkthroughStat>> {
  const rows = (await sql`
    SELECT
      w.platform,
      w.title,
      (SELECT COUNT(*)::int FROM coaching_nodes n WHERE n.platform = w.platform) AS node_count,
      EXISTS(
        SELECT 1 FROM coaching_nodes n
        WHERE n.platform = w.platform AND n.type = 'terminal'
      ) AS has_terminal,
      (SELECT COUNT(*)::int FROM coaching_progress p WHERE p.platform = w.platform) AS starts,
      (
        SELECT COUNT(*)::int FROM coaching_progress p
        WHERE p.platform = w.platform AND p.reached_terminal = true
      ) AS completes
    FROM coaching_walkthroughs w
  `) as unknown as WalkthroughStat[];

  const map: Record<string, WalkthroughStat> = {};
  for (const r of rows) map[r.platform] = r;
  return map;
}

export default async function CoachingLobbyPage() {
  const stats = await loadStats();

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Coaching Content</h1>
      <p className="mt-2 mb-8 text-muted">
        Per-platform walkthroughs that guide subscribers through connecting their accounts.
        Edits are live — subscribers see changes on next load.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PLATFORMS.map((p) => {
          const s = stats[p.key];
          const seeded = !!s;
          const completionRate =
            s && s.starts > 0
              ? Math.round((s.completes / s.starts) * 100)
              : null;
          return (
            <Link
              key={p.key}
              href={`/admin/coaching/${p.key}`}
              className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {seeded ? s.title : "Not seeded"}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    seeded
                      ? s.has_terminal
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                      : "bg-danger/10 text-danger"
                  }`}
                >
                  {seeded
                    ? s.has_terminal
                      ? "Live"
                      : "No terminal"
                    : "Missing"}
                </span>
              </div>
              {seeded && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-base font-semibold">{s.node_count}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">Nodes</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{s.starts}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">Starts</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">
                      {completionRate === null ? "—" : `${completionRate}%`}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">Complete</div>
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
