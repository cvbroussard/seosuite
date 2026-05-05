"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PostTemplate {
  id: string;
  platform: string;
  format: string;
  name: string;
  description: string | null;
  assetSlots: Record<string, unknown>;
  metadataRequirements: Record<string, unknown>;
  sortOrder: number;
}

interface AssetOption {
  id: string;
  url: string;
  type: string;
  contextNote: string | null;
  qualityScore: number | null;
}

interface RecommendResponse {
  template: { id: string; platform: string; format: string; name: string };
  slotCount: number;
  recommended: AssetOption[];
  alternatives: AssetOption[];
  captionStub: string;
  link: string;
  cta: { type: string; label: string; url: string };
  hashtags: string[];
}

interface PublishResponse {
  postId: string;
  status: string;
  scheduledAt: string;
  publishingTarget: string;
}

type ComposeStep = "select" | "recommend" | "review" | "published";

interface ComposeClientProps {
  siteId: string;
}

export function ComposeClient({ siteId: _siteId }: ComposeClientProps) {
  const [step, setStep] = useState<ComposeStep>("select");
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PostTemplate | null>(null);

  // Recommend-step state
  const [recommendation, setRecommendation] = useState<RecommendResponse | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [chosenAssetIds, setChosenAssetIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");

  // Trigger-step state
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);

  // Initial template list load
  useEffect(() => {
    fetch("/api/compose/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        setTemplates(d.templates);
        setConnectedPlatforms(d.connectedPlatforms);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  // Group templates by platform
  const grouped: Record<string, PostTemplate[]> = {};
  for (const t of templates) {
    if (!grouped[t.platform]) grouped[t.platform] = [];
    grouped[t.platform].push(t);
  }
  const platformsInOrder = Object.keys(grouped).sort();

  async function selectTemplate(t: PostTemplate) {
    setSelectedTemplate(t);
    setStep("recommend");
    setRecommendLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/compose/recommend?template_id=${t.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load recommendation");
        return;
      }
      const data: RecommendResponse = await res.json();
      setRecommendation(data);
      setChosenAssetIds(data.recommended.map((a) => a.id));
      setCaption(data.captionStub);
      setLink(data.link);
    } finally {
      setRecommendLoading(false);
    }
  }

  function backToSelect() {
    setStep("select");
    setSelectedTemplate(null);
    setRecommendation(null);
    setChosenAssetIds([]);
    setCaption("");
    setLink("");
    setError("");
    setPublishResult(null);
  }

  function backToRecommend() {
    setStep("recommend");
  }

  function swapAsset(oldId: string, newId: string) {
    setChosenAssetIds((prev) => prev.map((id) => (id === oldId ? newId : id)));
  }

  function removeAsset(id: string) {
    setChosenAssetIds((prev) => prev.filter((x) => x !== id));
  }

  function addAsset(id: string) {
    setChosenAssetIds((prev) => [...prev, id]);
  }

  async function publishNow() {
    if (!selectedTemplate) return;
    setPublishing(true);
    setError("");
    try {
      const res = await fetch("/api/compose/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          asset_ids: chosenAssetIds,
          caption,
          link,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to publish");
        return;
      }
      const data: PublishResponse = await res.json();
      setPublishResult(data);
      setStep("published");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Compose</h1>
          <p className="text-xs text-muted mt-0.5">
            {step === "select" && "Pick a template — TracPost will assemble the rest."}
            {step === "recommend" && `Reviewing the recommended package for ${selectedTemplate?.name ?? "your template"}.`}
            {step === "review" && "Final review before publishing."}
            {step === "published" && "Your post is queued for publishing."}
          </p>
        </div>
        {step !== "select" && step !== "published" && (
          <button
            onClick={step === "review" ? backToRecommend : backToSelect}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            ← Back
          </button>
        )}
        {step === "published" && (
          <button
            onClick={backToSelect}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            Compose another
          </button>
        )}
      </header>

      {/* Step pills (Select → Recommend → Review → Trigger → Published) */}
      <StepIndicator step={step} />

      {loading ? (
        <CenterSpinner />
      ) : error && step === "select" ? (
        <ErrorBox error={error} />
      ) : step === "select" ? (
        templates.length === 0 ? (
          <NoTemplatesEmpty connectedCount={connectedPlatforms.length} />
        ) : (
          <TemplatePicker grouped={grouped} platformsInOrder={platformsInOrder} onSelect={selectTemplate} />
        )
      ) : step === "recommend" || step === "review" ? (
        recommendLoading ? (
          <CenterSpinner />
        ) : recommendation ? (
          <RecommendReviewView
            step={step}
            recommendation={recommendation}
            chosenAssetIds={chosenAssetIds}
            caption={caption}
            link={link}
            error={error}
            publishing={publishing}
            onCaptionChange={setCaption}
            onLinkChange={setLink}
            onSwapAsset={swapAsset}
            onRemoveAsset={removeAsset}
            onAddAsset={addAsset}
            onProceedToReview={() => setStep("review")}
            onPublish={publishNow}
          />
        ) : (
          <ErrorBox error={error || "No recommendation"} />
        )
      ) : step === "published" && publishResult ? (
        <PublishedView result={publishResult} template={selectedTemplate} />
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: ComposeStep }) {
  const steps: Array<{ key: ComposeStep; label: string }> = [
    { key: "select", label: "Select" },
    { key: "recommend", label: "Recommend" },
    { key: "review", label: "Review" },
    { key: "published", label: "Trigger" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${
              i < activeIndex
                ? "bg-success text-white"
                : i === activeIndex
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted"
            }`}
          >
            {i + 1}
          </div>
          <span className={i === activeIndex ? "font-medium text-foreground" : "text-muted"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 text-muted">→</span>}
        </div>
      ))}
    </div>
  );
}

function TemplatePicker({
  grouped,
  platformsInOrder,
  onSelect,
}: {
  grouped: Record<string, PostTemplate[]>;
  platformsInOrder: string[];
  onSelect: (t: PostTemplate) => void;
}) {
  return (
    <div className="space-y-6">
      {platformsInOrder.map((platform) => (
        <section key={platform}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {prettyPlatformName(platform)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[platform].map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className="group text-left rounded-xl border border-border bg-surface p-4 shadow-card hover:border-accent hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-muted">{t.format}</span>
                  <span className="text-[10px] text-muted group-hover:text-accent transition-colors">
                    Pick →
                  </span>
                </div>
                <div className="text-sm font-semibold mb-1">{t.name}</div>
                {t.description && (
                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{t.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RecommendReviewProps {
  step: ComposeStep;
  recommendation: RecommendResponse;
  chosenAssetIds: string[];
  caption: string;
  link: string;
  error: string;
  publishing: boolean;
  onCaptionChange: (v: string) => void;
  onLinkChange: (v: string) => void;
  onSwapAsset: (oldId: string, newId: string) => void;
  onRemoveAsset: (id: string) => void;
  onAddAsset: (id: string) => void;
  onProceedToReview: () => void;
  onPublish: () => void;
}

function RecommendReviewView(props: RecommendReviewProps) {
  const { step, recommendation, chosenAssetIds, caption, link, error, publishing,
          onCaptionChange, onLinkChange, onRemoveAsset, onAddAsset, onProceedToReview, onPublish } = props;
  const isReview = step === "review";
  const assetsById = new Map<string, AssetOption>();
  for (const a of recommendation.recommended) assetsById.set(a.id, a);
  for (const a of recommendation.alternatives) assetsById.set(a.id, a);
  const chosen = chosenAssetIds.map((id) => assetsById.get(id)).filter((a): a is AssetOption => Boolean(a));
  const unused = recommendation.alternatives.filter((a) => !chosenAssetIds.includes(a.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: editable package */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Assets ({chosen.length})</h3>
            <span className="text-[10px] font-mono text-muted">
              slots: {recommendation.slotCount}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {chosen.map((a) => (
              <AssetTile key={a.id} asset={a} onRemove={!isReview ? () => onRemoveAsset(a.id) : undefined} />
            ))}
          </div>
          {!isReview && unused.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                Add another asset ({unused.length} available)
              </summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {unused.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAddAsset(a.id)}
                    className="group relative aspect-square rounded border border-border overflow-hidden hover:border-accent"
                  >
                    {a.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-hover text-muted text-xs">
                        Video
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 rounded-full bg-accent text-white text-[10px] px-1.5 py-0.5">
                      +
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Caption</h3>
          {isReview ? (
            <p className="text-sm text-foreground whitespace-pre-wrap min-h-[3em]">
              {caption || <span className="text-muted italic">(no caption)</span>}
            </p>
          ) : (
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Write a caption..."
              rows={4}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Link</h3>
          {isReview ? (
            <p className="text-sm font-mono text-foreground break-all">{link || <span className="text-muted italic">(no link)</span>}</p>
          ) : (
            <input
              value={link}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder="https://..."
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm font-mono focus:border-accent focus:outline-none"
            />
          )}
        </div>

        {error && <ErrorBox error={error} />}
      </div>

      {/* Right: meta + action */}
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-xs text-muted mb-1">Publishing to</p>
          <p className="text-base font-semibold">
            {prettyPlatformName(recommendation.template.platform)}
          </p>
          <p className="text-xs text-muted mt-1 font-mono">
            {recommendation.template.format} · {recommendation.template.name}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">CTA</h3>
          <p className="text-sm text-foreground">
            {recommendation.cta.label}
          </p>
          <p className="text-[11px] text-muted mt-1 font-mono break-all">
            → {recommendation.cta.url}
          </p>
        </div>

        <div className="pt-2">
          {!isReview ? (
            <button
              onClick={onProceedToReview}
              disabled={chosen.length < recommendation.slotCount}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Review →
            </button>
          ) : (
            <button
              onClick={onPublish}
              disabled={publishing}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish now"}
            </button>
          )}
          {!isReview && chosen.length < recommendation.slotCount && (
            <p className="text-[11px] text-muted mt-2">
              Need at least {recommendation.slotCount} asset{recommendation.slotCount === 1 ? "" : "s"} to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetTile({ asset, onRemove }: { asset: AssetOption; onRemove?: () => void }) {
  return (
    <div className="relative aspect-square rounded border border-border overflow-hidden bg-surface-hover">
      {asset.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted text-xs">
          Video
        </div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 rounded-full bg-danger text-white text-[10px] w-5 h-5 leading-none hover:bg-danger/80"
          title="Remove asset"
        >
          ×
        </button>
      )}
    </div>
  );
}

function PublishedView({ result, template }: { result: PublishResponse; template: PostTemplate | null }) {
  const scheduledTime = new Date(result.scheduledAt);
  const now = Date.now();
  const isImmediate = scheduledTime.getTime() <= now + 60000;
  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-6 space-y-3">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-success/20 w-10 h-10 flex items-center justify-center text-success text-lg">
          ✓
        </div>
        <div>
          <h2 className="text-lg font-semibold">Queued for publishing</h2>
          <p className="text-xs text-muted mt-0.5">
            {template?.name} → {prettyPlatformName(result.publishingTarget)}
          </p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-foreground">
          {isImmediate
            ? "Should appear on the platform within the next few minutes."
            : `Scheduled for ${scheduledTime.toLocaleString()}.`}
        </p>
        <p className="text-xs text-muted font-mono">post_id: {result.postId}</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Link
          href="/dashboard/calendar"
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
        >
          View in Calendar →
        </Link>
        <Link
          href="/dashboard/unipost"
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

function NoTemplatesEmpty({ connectedCount }: { connectedCount: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center">
      <p className="text-sm font-medium mb-2">No templates available yet</p>
      <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
        {connectedCount === 0
          ? "Connect at least one social platform to see publishing templates here. Blog templates are available without any external connection."
          : "Templates exist for your connected platforms but couldn't be loaded. Try refreshing."}
      </p>
      <Link
        href="/dashboard/accounts"
        className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Manage Connections
      </Link>
    </div>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
      <p className="text-sm text-danger">{error}</p>
    </div>
  );
}

function CenterSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function prettyPlatformName(slug: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    pinterest: "Pinterest",
    blog: "Blog",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    gbp: "Google Business Profile",
    twitter: "X (Twitter)",
  };
  return map[slug] ?? slug;
}
