"use client";

import { useState, useEffect } from "react";
import { BrandPlaybookView } from "@/app/dashboard/brand/brand-playbook-view";
import { toast, confirm } from "@/components/feedback";

interface CompareResponse {
  site: { id: string; name: string; businessType: string; location: string };
  score: {
    score: number;
    tier: "minimal" | "moderate" | "rich";
    breakdown: {
      qualityCaptions: { count: number; score: number; weight: number };
      positiveReviews: { count: number; score: number; weight: number };
      gbpProfile: { score: number; weight: number; fieldsPresent: string[] };
      voiceConsistency: { score: number; weight: number; cv: number | null; captionsAnalyzed: number };
    };
  };
  signals: Record<string, unknown> | null;
  baseline: Record<string, unknown>;
  v2: Record<string, unknown>;
  activeSource: "playbook" | "dna";
  cached: boolean;
  generatedAt: string | null;
}

const TIER_COLOR: Record<string, string> = {
  minimal: "bg-muted/20 text-muted",
  moderate: "bg-warning/10 text-warning",
  rich: "bg-success/10 text-success",
};

export function CompareModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [pane, setPane] = useState<"signals" | "side" | "playbook" | "dna">("side");

  function load(force = false) {
    if (force) setRegenerating(true); else setLoading(true);
    fetch("/api/admin/brand-dna/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, force }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d);
        if (force && d) toast.success("Brand DNA regenerated");
      })
      .catch(() => toast.error("Compare request failed"))
      .finally(() => { setLoading(false); setRegenerating(false); });
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function regenerate() {
    if (!data) return;
    const ok = await confirm({
      title: "Regenerate Brand DNA?",
      body: "Re-runs signal extraction (2 Haiku calls) and playbook generation (1 Sonnet call). Takes 30–90 seconds. Current cached envelope is overwritten.",
      confirmLabel: "Regenerate",
    });
    if (!ok) return;
    load(true);
  }

  async function activate(source: "playbook" | "dna") {
    if (!data) return;
    const verb = source === "dna" ? "Activate Brand DNA" : "Revert to Brand Playbook";
    const ok = await confirm({
      title: `${verb}?`,
      body: source === "dna"
        ? "Brand DNA becomes the active source for downstream content generation. Brand Playbook stays preserved — toggle back at any time."
        : "Brand Playbook becomes the active source. Brand DNA stays cached — toggle back at any time.",
      confirmLabel: verb,
    });
    if (!ok) return;
    setActivating(true);
    try {
      const res = await fetch("/api/admin/brand-dna/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, source }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(source === "dna" ? "Brand DNA active" : "Brand Playbook active");
        setData(prev => prev ? { ...prev, activeSource: source } : prev);
      } else {
        toast.error(`Failed: ${d.error || "unknown"}`);
      }
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={onClose}>
      <div
        className="bg-background w-full h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Brand Playbook vs Brand DNA</h2>
            {data && (
              <>
                <span className="text-xs text-muted">{data.site.name}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${TIER_COLOR[data.score.tier]}`}>
                  {data.score.tier} · score {data.score.score}
                </span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${data.activeSource === "dna" ? "bg-accent/10 text-accent" : "bg-surface-hover text-foreground"}`}>
                  active: {data.activeSource === "dna" ? "Brand DNA" : "Brand Playbook"}
                </span>
                {data.cached && data.generatedAt && (
                  <span className="text-[10px] text-muted" title={new Date(data.generatedAt).toLocaleString()}>
                    cached · {timeAgo(data.generatedAt)}
                  </span>
                )}
              </>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none px-2" aria-label="Close">×</button>
        </div>

        {/* Body */}
        {loading || regenerating ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="h-5 w-5 mx-auto mb-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs text-muted">
                {regenerating
                  ? "Regenerating Brand DNA — extracting signals and generating playbook (30–90s)…"
                  : "Loading…"}
              </p>
            </div>
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-danger">Failed to load comparison.</p>
          </div>
        ) : (
          <>
            {/* Score breakdown bar */}
            <div className="border-b border-border bg-surface px-5 py-3 shrink-0">
              <div className="grid grid-cols-4 gap-4 text-[11px]">
                <ScoreCell
                  label="Quality captions"
                  count={data.score.breakdown.qualityCaptions.count}
                  score={data.score.breakdown.qualityCaptions.score}
                  weight={data.score.breakdown.qualityCaptions.weight}
                />
                <ScoreCell
                  label="Positive reviews"
                  count={data.score.breakdown.positiveReviews.count}
                  score={data.score.breakdown.positiveReviews.score}
                  weight={data.score.breakdown.positiveReviews.weight}
                />
                <ScoreCell
                  label="GBP profile"
                  detail={data.score.breakdown.gbpProfile.fieldsPresent.join(", ") || "incomplete"}
                  score={data.score.breakdown.gbpProfile.score}
                  weight={data.score.breakdown.gbpProfile.weight}
                />
                <ScoreCell
                  label="Voice consistency"
                  detail={data.score.breakdown.voiceConsistency.captionsAnalyzed > 0
                    ? `cv ${data.score.breakdown.voiceConsistency.cv ?? "—"}, n=${data.score.breakdown.voiceConsistency.captionsAnalyzed}`
                    : "no captions"}
                  score={data.score.breakdown.voiceConsistency.score}
                  weight={data.score.breakdown.voiceConsistency.weight}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border px-5 shrink-0">
              <div className="flex gap-px">
                {(["side", "signals", "playbook", "dna"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setPane(t)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      pane === t ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {t === "side" ? "Side-by-side"
                      : t === "signals" ? `Signals${data.signals ? "" : " (none)"}`
                      : t === "playbook" ? "Brand Playbook"
                      : "Brand DNA"}
                  </button>
                ))}
              </div>
            </div>

            {/* Pane content — explicit min-h-0 lets the inner overflow-auto work
                inside the parent flex column. Without min-h-0 a flex item refuses
                to shrink below its content height, which suppresses scrolling. */}
            <div className="flex-1 overflow-auto min-h-0">
              {pane === "side" && (
                <div className="grid grid-cols-2 divide-x divide-border">
                  <PlaybookPanel title="Brand Playbook" playbook={data.baseline} />
                  <PlaybookPanel title={`Brand DNA · ${data.score.tier}`} playbook={data.v2} accent />
                </div>
              )}
              {pane === "signals" && (
                <div className="p-6">
                  {data.signals ? (
                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono bg-surface rounded-lg p-4 border border-border">
                      {JSON.stringify(data.signals, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted">No signals extracted — site is in minimal tier (score &lt; 0.3). Augmentation skipped; Brand DNA should be effectively identical to the Brand Playbook.</p>
                  )}
                </div>
              )}
              {pane === "playbook" && (
                <PlaybookPanel title="Brand Playbook (full width)" playbook={data.baseline} fullWidth />
              )}
              {pane === "dna" && (
                <PlaybookPanel title={`Brand DNA · ${data.score.tier} (full width)`} playbook={data.v2} fullWidth accent />
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-border bg-surface px-5 py-3 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-muted">
                Both versions stay stored. Toggle the active source instantly without losing either.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={regenerate}
                  disabled={regenerating || activating}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
                  title="Re-extract signals and re-generate Brand DNA (30–90s, ~$0.15)"
                >
                  Regenerate
                </button>
                <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover">
                  Close
                </button>
                {data.activeSource === "playbook" ? (
                  <button
                    onClick={() => activate("dna")}
                    disabled={activating}
                    className="rounded bg-accent text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {activating ? "Activating…" : "Activate Brand DNA"}
                  </button>
                ) : (
                  <button
                    onClick={() => activate("playbook")}
                    disabled={activating}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
                  >
                    {activating ? "Reverting…" : "Revert to Brand Playbook"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ScoreCell({ label, count, detail, score, weight }: { label: string; count?: number; detail?: string; score: number; weight: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{label}</p>
      <p className="font-medium">
        {count !== undefined ? `${count} item${count === 1 ? "" : "s"}` : detail}
      </p>
      <p className="text-[10px] text-muted mt-0.5">
        score {score} · weight {weight}
      </p>
    </div>
  );
}

function PlaybookPanel({ title, playbook, accent, fullWidth }: { title: string; playbook: Record<string, unknown>; accent?: boolean; fullWidth?: boolean }) {
  return (
    <div className={`p-5 ${fullWidth ? "" : "min-w-0"}`}>
      <h3 className={`text-xs font-semibold mb-3 ${accent ? "text-accent" : ""}`}>{title}</h3>
      <BrandPlaybookView
        siteId="compare"
        playbook={playbook}
        subscriberAngle={null}
      />
    </div>
  );
}
