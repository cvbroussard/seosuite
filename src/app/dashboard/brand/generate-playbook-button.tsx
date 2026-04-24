"use client";

import { useState } from "react";

export function GeneratePlaybookButton({ siteId, businessType, location, websiteUrl, compact }: { siteId: string; businessType: string; location: string; websiteUrl: string; compact?: boolean }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_generate", site_id: siteId, business_type: businessType, location, website_url: websiteUrl }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setGenerating(false);
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={generating}
          className="rounded bg-surface-hover px-3 py-1 text-[10px] font-medium hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {generating ? "Generating..." : "Regenerate Playbook"}
        </button>
        {error && <span className="text-[10px] text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="py-16 text-center">
      <h1>Brand Intelligence</h1>
      <p className="mt-2 mb-6 text-muted">
        Generate your brand playbook to shape how content is created.
      </p>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button
        onClick={generate}
        disabled={generating}
        className="bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {generating ? "Generating playbook..." : "Generate Brand Playbook"}
      </button>
      {generating && (
        <p className="mt-4 text-xs text-muted">This may take a minute — analyzing your site and content...</p>
      )}
    </div>
  );
}
