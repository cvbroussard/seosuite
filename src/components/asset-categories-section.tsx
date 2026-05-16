"use client";

import { useEffect, useState, useCallback } from "react";

interface SiteCategory {
  gcid: string;
  name: string;
}

interface Assignment {
  gcid: string;
  name: string;
  is_primary: boolean;
  confidence: number | null;
  assigned_by: "auto" | "operator" | "subscriber";
  reasoning: string | null;
  assigned_at: string;
}

interface CategoriesResponse {
  asset: { id: string; hasTranscript: boolean };
  siteCategories: SiteCategory[];
  assignments: Assignment[];
}

/**
 * Asset modal section for GBP category assignments.
 *
 * Replaces the services tag group per #223 — categories ARE the
 * canonical structured tag now (per project_tracpost_gbp_categories
 * _coaching memory).
 *
 * Auto-assigned at briefing-complete by the multimodal categorizer
 * (image + transcript → ranked gcids). Operator/subscriber overrides
 * are preserved across re-categorization.
 *
 * Display:
 *   - Primary category pill (★ marker)
 *   - Secondary pills (rare — only when LLM confidence ≥0.85)
 *   - Empty state if no transcript yet ("pending briefing")
 *   - Empty state if no site categories ("complete categories coaching first")
 *   - Confidence + reasoning on hover/click (inspector mode)
 *   - "Add another" picker drops down to site's remaining categories
 *   - "Set as primary" + "Remove" actions per existing pill
 */
export function AssetCategoriesSection({ assetId }: { assetId: string }) {
  const [data, setData] = useState<CategoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [inspectingGcid, setInspectingGcid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/categories`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = (await res.json()) as CategoriesResponse;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "add" | "remove" | "set_primary", gcid: string) {
    try {
      const res = await fetch(`/api/assets/${assetId}/categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, gcid }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      await load();
      setPicking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="border-t border-border px-6 py-4">
        <label className="mb-1.5 block text-xs text-muted">Category</label>
        <p className="text-[11px] text-muted">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-t border-border px-6 py-4">
        <label className="mb-1.5 block text-xs text-muted">Category</label>
        <p className="text-[11px] text-danger">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { siteCategories, assignments, asset } = data;
  const primary = assignments.find((a) => a.is_primary);
  const secondaries = assignments.filter((a) => !a.is_primary);
  const assigned = new Set(assignments.map((a) => a.gcid));
  const addable = siteCategories.filter((c) => !assigned.has(c.gcid));

  return (
    <div className="border-t border-border px-6 py-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs text-muted">Category</label>
        {assignments.length > 0 && primary?.assigned_by === "auto" && primary.confidence !== null && (
          <span className="text-[9px] text-muted">
            auto · {(Number(primary.confidence) * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

      {/* Empty states */}
      {siteCategories.length === 0 && (
        <div className="rounded border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted">
          No GBP categories declared for this site. Categories will be available after the operator
          completes categories coaching for this site.
        </div>
      )}

      {siteCategories.length > 0 && assignments.length === 0 && !asset.hasTranscript && (
        <div className="rounded border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted">
          Pending briefing. Auto-categorization fires once a transcript exists for this asset.
        </div>
      )}

      {siteCategories.length > 0 && assignments.length === 0 && asset.hasTranscript && (
        <div className="rounded border border-dashed border-warning/40 bg-warning/5 px-3 py-2 text-[11px] text-warning">
          Transcript present but no category assigned. Auto-categorization may have errored.
          Use the picker below to assign manually.
        </div>
      )}

      {/* Assigned pills */}
      {assignments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {primary && (
            <CategoryPill
              key={primary.gcid}
              assignment={primary}
              isInspecting={inspectingGcid === primary.gcid}
              onInspect={() => setInspectingGcid(inspectingGcid === primary.gcid ? null : primary.gcid)}
              onRemove={() => act("remove", primary.gcid)}
              onSetPrimary={() => {}}
              variant="primary"
            />
          )}
          {secondaries.map((a) => (
            <CategoryPill
              key={a.gcid}
              assignment={a}
              isInspecting={inspectingGcid === a.gcid}
              onInspect={() => setInspectingGcid(inspectingGcid === a.gcid ? null : a.gcid)}
              onRemove={() => act("remove", a.gcid)}
              onSetPrimary={() => act("set_primary", a.gcid)}
              variant="secondary"
            />
          ))}
          {addable.length > 0 && (
            <button
              onClick={() => setPicking(!picking)}
              className="rounded bg-surface-hover px-2 py-0.5 text-xs text-muted hover:text-foreground"
            >
              {picking ? "Cancel" : "+ Add"}
            </button>
          )}
        </div>
      )}

      {/* Picker */}
      {picking && addable.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-background p-2">
          <div className="flex flex-wrap gap-1.5">
            {addable.map((c) => (
              <button
                key={c.gcid}
                onClick={() => act("add", c.gcid)}
                className="rounded bg-surface px-2 py-0.5 text-xs text-muted hover:bg-accent/10 hover:text-accent"
              >
                + {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning inspector (collapsible per pill) */}
      {inspectingGcid && (() => {
        const a = assignments.find((x) => x.gcid === inspectingGcid);
        if (!a) return null;
        return (
          <div className="mt-2 rounded border border-border bg-background px-3 py-2">
            <p className="text-[10px] text-muted">
              {a.assigned_by === "auto" ? "Auto-categorized" : `Set by ${a.assigned_by}`}
              {" · "}
              {new Date(a.assigned_at).toLocaleString()}
              {a.confidence !== null && ` · ${(Number(a.confidence) * 100).toFixed(0)}% confidence`}
            </p>
            {a.reasoning && <p className="mt-1 text-[11px] leading-relaxed">{a.reasoning}</p>}
          </div>
        );
      })()}

      {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
    </div>
  );
}

function CategoryPill({
  assignment,
  isInspecting,
  onInspect,
  onRemove,
  onSetPrimary,
  variant,
}: {
  assignment: Assignment;
  isInspecting: boolean;
  onInspect: () => void;
  onRemove: () => void;
  onSetPrimary: () => void;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <div className="group relative inline-flex items-center gap-1">
      <button
        onClick={onInspect}
        title={assignment.reasoning || undefined}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
          isPrimary
            ? "bg-accent text-white"
            : "bg-accent/15 text-accent ring-1 ring-accent/30"
        } ${isInspecting ? "ring-2 ring-accent/60" : ""}`}
      >
        {isPrimary && <span>★</span>}
        {assignment.name}
      </button>
      {!isPrimary && (
        <button
          onClick={onSetPrimary}
          title="Make primary"
          className="text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        >
          ★
        </button>
      )}
      <button
        onClick={onRemove}
        title="Remove"
        className="text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}
