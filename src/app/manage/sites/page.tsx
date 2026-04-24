"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface SiteSettings {
  site: {
    image_style: string | null;
    image_variations: string[] | null;
    image_processing_mode: string | null;
    inline_upload_count: number;
    inline_ai_count: number;
    content_vibe: string | null;
  };
}

function SiteControlsContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentVibe, setContentVibe] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [processingMode, setProcessingMode] = useState("auto");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/site?site_id=${siteId}&view=visual`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d);
        if (d?.site) {
          setContentVibe(d.site.content_vibe || "");
          setImageStyle(d.site.image_style || "");
          setProcessingMode(d.site.image_processing_mode || "auto");
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function saveSection(section: string, payload: Record<string, unknown>) {
    setSaving(section);
    setSaved(null);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ...payload }),
    });
    setSaving(null);
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      {/* Content direction */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Content Direction</h3>
        <label className="block text-[10px] text-muted mb-1">Content Vibe</label>
        <textarea
          value={contentVibe}
          onChange={e => setContentVibe(e.target.value)}
          ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none resize-none overflow-hidden"
          placeholder="Culinary lifestyle — cooking, entertaining, hosting..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => saveSection("vibe", { contentVibe, style: imageStyle, variations: data?.site.image_variations || [], processingMode })}
            disabled={saving === "vibe"}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          {saved === "vibe" && <span className="text-[10px] text-success">Saved</span>}
        </div>
      </div>
    </div>
  );
}

export default function ManageSitesPage() {
  return (
    <ManagePage title="Site Controls" requireSite>
      {({ siteId }) => <SiteControlsContent siteId={siteId} />}
    </ManagePage>
  );
}
