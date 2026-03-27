"use client";

import { useState } from "react";

interface PillarTag {
  id: string;
  label: string;
}

interface Pillar {
  id: string;
  framework?: string;
  label: string;
  description: string;
  tags: PillarTag[];
}

const FRAMEWORK = [
  { id: "what", framework: "What We Do" },
  { id: "how", framework: "How We Do It" },
  { id: "who", framework: "Who We Work With" },
  { id: "proof", framework: "Proof It Works" },
  { id: "why", framework: "Why It Matters" },
];

export function AdminPillarEditor({
  siteId,
  initialConfig,
}: {
  siteId: string;
  initialConfig: Pillar[];
}) {
  const normalized = FRAMEWORK.map((f) => {
    const existing = initialConfig.find((p) => p.id === f.id);
    return existing || { ...f, label: "", description: "", tags: [] };
  });

  const [config, setConfig] = useState<Pillar[]>(normalized);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasConfig = config.some((p) => p.label && p.tags.length > 0);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/pillar-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, config }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updatePillar(pillarId: string, field: "label" | "description", value: string) {
    setConfig((prev) =>
      prev.map((p) => (p.id === pillarId ? { ...p, [field]: value } : p))
    );
  }

  function addTag(pillarId: string) {
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: [...p.tags, { id: `new_${p.tags.length}`, label: "" }] }
          : p
      )
    );
  }

  function updateTag(pillarId: string, tagIndex: number, label: string) {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: p.tags.map((t, i) => (i === tagIndex ? { id: id || t.id, label } : t)) }
          : p
      )
    );
  }

  function removeTag(pillarId: string, tagIndex: number) {
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: p.tags.filter((_, i) => i !== tagIndex) }
          : p
      )
    );
  }

  if (!hasConfig) {
    return (
      <div className="mt-3">
        <span className="text-xs text-muted">Pillars generate after playbook sharpening</span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-accent hover:underline"
      >
        {isOpen ? "▾" : "▸"} Content Pillars ({config.filter((p) => p.tags.length > 0).length}/5 configured)
      </button>

      {isOpen && (
        <div className="mt-2 rounded border border-border bg-background p-3">
          {config.map((pillar) => {
            const isExpanded = expanded === pillar.id;
            const isConfigured = pillar.label && pillar.tags.length > 0;

            return (
              <div key={pillar.id} className="border-b border-border last:border-0">
                <button
                  onClick={() => setExpanded(isExpanded ? null : pillar.id)}
                  className="flex w-full items-center justify-between py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                      {pillar.framework}
                    </span>
                    <span className={`text-xs font-medium ${isConfigured ? "" : "text-muted italic"}`}>
                      {pillar.label || "Not configured"}
                    </span>
                    {isConfigured && (
                      <span className="text-[10px] text-muted">{pillar.tags.length} tags</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted">{isExpanded ? "▾" : "▸"}</span>
                </button>

                {isExpanded && (
                  <div className="pb-3">
                    <p className="mb-2 text-[10px] text-dim">
                      {pillar.id === "what" ? "The craft, skill, or service itself" :
                       pillar.id === "how" ? "The process, tools, infrastructure, standards" :
                       pillar.id === "who" ? "Vendors, materials, partners, artisans" :
                       pillar.id === "proof" ? "Projects, results, case studies, before/after" :
                       "Philosophy, perspective, culture, community"}
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] text-muted">Industry Label</label>
                        <input
                          value={pillar.label}
                          onChange={(e) => updatePillar(pillar.id, "label", e.target.value)}
                          className="w-full text-xs"
                          placeholder="e.g., Design, Menu, Training"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] text-muted">ID (fixed)</label>
                        <input value={pillar.id} className="w-full text-xs" disabled />
                      </div>
                    </div>
                    <div className="mt-1">
                      <label className="mb-0.5 block text-[10px] text-muted">AI Description</label>
                      <input
                        value={pillar.description}
                        onChange={(e) => updatePillar(pillar.id, "description", e.target.value)}
                        className="w-full text-xs"
                        placeholder="What AI reads during content classification"
                      />
                    </div>

                    <div className="mt-2">
                      <label className="mb-1 block text-[10px] text-muted">Tags (4-6 recommended)</label>
                      <div className="flex flex-wrap gap-1">
                        {pillar.tags.map((tag, i) => (
                          <div key={tag.id || i} className="flex items-center gap-0.5 rounded bg-surface-hover px-1.5 py-0.5">
                            <input
                              value={tag.label}
                              onChange={(e) => updateTag(pillar.id, i, e.target.value)}
                              className="w-24 bg-transparent text-[10px] outline-none"
                              placeholder="Tag name"
                            />
                            <button
                              onClick={() => removeTag(pillar.id, i)}
                              className="text-[10px] text-muted hover:text-danger"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addTag(pillar.id)}
                          className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted hover:text-foreground"
                        >
                          + Tag
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2 pt-2">
            {saving && <span className="text-[10px] text-muted">Saving...</span>}
            {saved && <span className="text-[10px] text-success">Saved</span>}
            <button
              onClick={save}
              className="bg-accent px-2 py-0.5 text-[10px] font-medium text-white hover:bg-accent-hover"
            >
              Save Pillars
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
