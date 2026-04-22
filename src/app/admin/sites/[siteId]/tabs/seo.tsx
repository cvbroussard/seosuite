"use client";

import { useState, useEffect } from "react";

interface AuditItem {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
}

interface PageScore {
  url: string;
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  audits: AuditItem[];
  scored_at: string;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-success/10";
  if (score >= 50) return "bg-warning/10";
  return "bg-danger/10";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${scoreColor(score)} ${scoreBg(score)}`}>
      {score}
    </span>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
        <circle
          cx="44" cy="44" r="36" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`-mt-14 text-lg font-semibold ${scoreColor(score)}`}>{score}</span>
      <span className="mt-6 text-[10px] text-muted">{label}</span>
    </div>
  );
}

function pageLabel(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "Home";
    return path.replace(/^\//, "").replace(/\/$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return url;
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SeoTab({ siteId }: { siteId: string }) {
  const [scores, setScores] = useState<PageScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/sites/${siteId}/page-scores`)
      .then((r) => r.json())
      .then((data) => setScores(data.scores || []))
      .finally(() => setLoading(false));
  }, [siteId]);

  async function scoreAll() {
    setScoring("all");
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/page-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score_all" }),
      });
      if (res.ok) {
        const fresh = await fetch(`/api/admin/sites/${siteId}/page-scores`);
        const data = await fresh.json();
        setScores(data.scores || []);
      }
    } catch { /* ignore */ }
    setScoring(null);
  }

  async function scoreOne(url: string) {
    setScoring(url);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/page-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const fresh = await fetch(`/api/admin/sites/${siteId}/page-scores`);
        const data = await fresh.json();
        setScores(data.scores || []);
      }
    } catch { /* ignore */ }
    setScoring(null);
  }

  const avgScore = (key: keyof PageScore) => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((s, p) => s + (p[key] as number), 0) / scores.length);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">PageSpeed Insights</h2>
          <p className="text-xs text-muted">{scores.length} pages scored</p>
        </div>
        <button
          onClick={scoreAll}
          disabled={scoring !== null}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {scoring === "all" ? "Scoring all pages (~60s)..." : "Score All Pages"}
        </button>
      </div>

      {/* Score rings */}
      {scores.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <div className="flex justify-around">
            <ScoreRing score={avgScore("performance")} label="Performance" />
            <ScoreRing score={avgScore("seo")} label="SEO" />
            <ScoreRing score={avgScore("accessibility")} label="Accessibility" />
            <ScoreRing score={avgScore("best_practices")} label="Best Practices" />
          </div>
        </div>
      )}

      {/* Page list with audits */}
      {scores.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {scores.map((page) => {
              const isExpanded = expanded === page.url;
              const audits = (page.audits || []) as AuditItem[];
              const failCount = audits.filter(a => a.score !== null && a.score < 0.5).length;

              return (
                <div key={page.url}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : page.url)}
                    className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-hover ${isExpanded ? "bg-surface-hover" : ""}`}
                  >
                    <span className={`text-[9px] text-muted w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                      {audits.length > 0 ? "▶" : " "}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{pageLabel(page.url)}</p>
                      <p className="text-[10px] text-muted truncate">{page.url}</p>
                    </div>

                    <ScoreBadge score={page.performance} />
                    <ScoreBadge score={page.seo} />
                    <ScoreBadge score={page.accessibility} />
                    <ScoreBadge score={page.best_practices} />

                    {failCount > 0 && (
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[9px] text-danger">
                        {failCount} issues
                      </span>
                    )}

                    <span className="text-[10px] text-muted w-14 text-right">{timeAgo(page.scored_at)}</span>

                    <button
                      onClick={(e) => { e.stopPropagation(); scoreOne(page.url); }}
                      disabled={scoring !== null}
                      className="text-[10px] text-accent hover:underline disabled:opacity-50"
                    >
                      {scoring === page.url ? "..." : "Rescore"}
                    </button>
                  </div>

                  {isExpanded && audits.length > 0 && (
                    <div className="bg-black/20 border-t border-border px-8 py-3">
                      <p className="text-[10px] text-muted mb-2">Failing audits ({audits.length})</p>
                      <div className="space-y-2">
                        {audits.map((audit) => {
                          const severity = audit.score === null ? "info"
                            : audit.score === 0 ? "high"
                            : audit.score < 0.5 ? "medium"
                            : "low";
                          const severityColor = severity === "high" ? "text-danger"
                            : severity === "medium" ? "text-warning"
                            : "text-muted";
                          const severityBg = severity === "high" ? "bg-danger/10"
                            : severity === "medium" ? "bg-warning/10"
                            : "bg-surface-hover";

                          return (
                            <div key={audit.id} className="flex items-start gap-2">
                              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${severityColor} ${severityBg}`}>
                                {severity}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium">{audit.title}</p>
                                {audit.displayValue && (
                                  <p className="text-[10px] text-muted">{audit.displayValue}</p>
                                )}
                                <p className="text-[10px] text-muted mt-0.5 line-clamp-2">{audit.description.replace(/\[.*?\]\(.*?\)/g, "").trim()}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">No pages scored yet</p>
          <p className="mt-1 text-xs text-muted">
            Click "Score All Pages" to run PageSpeed Insights on the site's core pages.
          </p>
        </div>
      )}
    </div>
  );
}
