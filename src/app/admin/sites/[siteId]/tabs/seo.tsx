"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PageScore {
  url: string;
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  scored_at: string;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

export function SeoTab({ siteId }: { siteId: string }) {
  const [scores, setScores] = useState<PageScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/sites/${siteId}/page-scores`)
      .then(r => r.json())
      .then(data => setScores(data.scores || []))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const avg = (key: keyof PageScore) => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((s, p) => s + (p[key] as number), 0) / scores.length);
  };

  return (
    <div className="space-y-4">
      {scores.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
              <p className={`text-2xl font-semibold ${scoreColor(avg("performance"))}`}>{avg("performance")}</p>
              <p className="text-[10px] text-muted">Performance</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
              <p className={`text-2xl font-semibold ${scoreColor(avg("seo"))}`}>{avg("seo")}</p>
              <p className="text-[10px] text-muted">SEO</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
              <p className={`text-2xl font-semibold ${scoreColor(avg("accessibility"))}`}>{avg("accessibility")}</p>
              <p className="text-[10px] text-muted">Accessibility</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card text-center">
              <p className={`text-2xl font-semibold ${scoreColor(avg("best_practices"))}`}>{avg("best_practices")}</p>
              <p className="text-[10px] text-muted">Best Practices</p>
            </div>
          </div>

          <p className="text-xs text-muted">{scores.length} pages scored</p>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-sm">No pages scored yet</p>
          <p className="mt-1 text-xs text-muted">Run PageSpeed scoring from the full SEO module.</p>
        </div>
      )}

      <Link
        href="/admin/seo"
        className="inline-flex items-center gap-1.5 rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
      >
        Open SEO Module →
      </Link>
    </div>
  );
}
