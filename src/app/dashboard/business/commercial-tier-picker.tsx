"use client";

import { useEffect, useState } from "react";

interface PickerTier {
  slug: string;
  label: string;
  description: string;
}

interface CurrentTier {
  slug: string;
  label: string;
}

/**
 * Commercial tier picker — subscriber-facing surface for selecting
 * their site's commercial tier (per project_tracpost_tier_model.md).
 *
 * The picker IS the coaching. Each tier card explains what the tier
 * means and what TracPost will surface in the CMA for it. Subscriber
 * owns the selection; the lever stays in their hands. Misclassification
 * is self-fixable — if the CMA looks off, change tier and re-run.
 *
 * Below the picker: "None of these fit me" qualification gate. For
 * subscribers whose business doesn't match TracPost's target zone
 * (solo / startup / B2B / enterprise) or who have unusual
 * configurations (multi-location, multi-entity), route to operator
 * white-glove via an intake message rather than forcing them into a
 * tier that misfits.
 */
export function CommercialTierPicker({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [pickerTiers, setPickerTiers] = useState<PickerTier[]>([]);
  const [currentTier, setCurrentTier] = useState<CurrentTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQualGate, setShowQualGate] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/dashboard/commercial-tier?site_id=${siteId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Failed to load (${r.status})`)))
      .then((data) => {
        setPickerTiers(data.pickerTiers || []);
        setCurrentTier(data.currentTier || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  async function selectTier(tier: PickerTier) {
    if (currentTier?.slug === tier.slug || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/commercial-tier`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_id: siteId, tier_slug: tier.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setCurrentTier(data.tier);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-border bg-surface p-4 text-xs text-muted">Loading tier…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Commercial Tier</h2>
        <p className="mt-0.5 text-[11px] text-muted">
          Tell us where {siteName} sits in your market. This filters your competitive analysis to actual peers and shapes the strategic recommendations TracPost produces for you.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] text-danger">{error}</div>
      )}

      <div className="space-y-2">
        {pickerTiers.map((t) => {
          const selected = currentTier?.slug === t.slug;
          return (
            <button
              key={t.slug}
              onClick={() => selectTier(t)}
              disabled={saving}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                selected
                  ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                  : "border-border bg-surface hover:border-accent/40 hover:bg-accent/[0.02]"
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{t.label}</h3>
                {selected && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-medium text-white">
                    ✓ SELECTED
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{t.description}</p>
            </button>
          );
        })}
      </div>

      {/* Qualification gate */}
      <div className="pt-2">
        {!showQualGate ? (
          <button
            onClick={() => setShowQualGate(true)}
            className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            None of these fit me
          </button>
        ) : (
          <QualificationGate onClose={() => setShowQualGate(false)} />
        )}
      </div>
    </div>
  );
}

function QualificationGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-warning">Your situation is different</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            TracPost is built for a specific kind of operator. If your business doesn&apos;t match any of the tiers above, here&apos;s honest guidance on whether TracPost will work for you.
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-muted hover:text-foreground">✕</button>
      </div>

      <div className="space-y-2 text-[11px]">
        <QualOption
          title="Solo operator / handyman"
          message="TracPost is built for businesses with established systems and a portfolio of work to amplify. Solo operations typically don&apos;t have the operational capacity to leverage what we provide. We&apos;re not the right fit today."
          variant="not-fit"
        />
        <QualOption
          title="Brand new business or startup"
          message="Our moat is amplifying the existing work you&apos;ve already done. Brand-new businesses don&apos;t have the portfolio yet for that to compound. Come back in 6-12 months when you have meaningful work to draw from."
          variant="not-fit"
        />
        <QualOption
          title="B2B / commercial contractor (RFP-driven sales)"
          message="TracPost optimizes for consumer-facing local search and GBP visibility. B2B contract sales don&apos;t benefit from the same machinery. Different sales motion entirely."
          variant="not-fit"
        />
        <QualOption
          title="Enterprise / national chain (30+ locations or $30M+)"
          message="At your scale you likely have in-house marketing teams and tooling needs we&apos;re not designed for. Reach out if you&apos;d like to discuss whether there&apos;s a partnership fit."
          variant="not-fit"
        />
        <QualOption
          title="Multi-location operator (several locations under one brand)"
          message="TracPost handles this today via per-location site setup. Operators on our team configure the multi-location structure during white-glove onboarding. If you signed up and ended up with one site instead of several, reach out and we&apos;ll get it right."
          variant="contact"
        />
        <QualOption
          title="Multi-entity owner (several separate businesses)"
          message="Same answer — supported today, but typically needs operator-led setup so each entity is configured independently. If your subscription only covers one of your businesses and you&apos;d like to add the others, contact us."
          variant="contact"
        />
        <QualOption
          title="My situation is none of these"
          message="Tell us what&apos;s going on. We&apos;ll review and either configure TracPost correctly for you, or be honest if we&apos;re not the right fit."
          variant="contact"
        />
      </div>
    </div>
  );
}

function QualOption({ title, message, variant }: { title: string; message: string; variant: "not-fit" | "contact" }) {
  return (
    <div className={`rounded-lg border p-2.5 ${variant === "not-fit" ? "border-border bg-background" : "border-accent/30 bg-accent/[0.03]"}`}>
      <p className="text-xs font-medium">
        {variant === "not-fit" ? "✗ " : "→ "}
        {title}
      </p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{message}</p>
    </div>
  );
}
