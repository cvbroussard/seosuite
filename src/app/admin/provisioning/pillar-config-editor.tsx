"use client";

import { useState } from "react";

interface PillarTag {
  id: string;
  label: string;
}

interface Pillar {
  id: string;
  label: string;
  description: string;
  tags: PillarTag[];
}

export function AdminPillarEditor({
  siteId,
  initialConfig,
}: {
  siteId: string;
  initialConfig: Pillar[];
}) {
  const [config, setConfig] = useState<Pillar[]>(initialConfig);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const tagNum = config.find((p) => p.id === pillarId)?.tags.length || 0;
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: [...p.tags, { id: `new_tag_${tagNum}`, label: "New Tag" }] }
          : p
      )
    );
  }

  function updateTag(pillarId: string, tagIndex: number, label: string) {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
    setConfig((prev) =>
      prev.map((p) =>
        p.id === pillarId
          ? { ...p, tags: p.tags.map((t, i) => (i === tagIndex ? { id, label } : t)) }
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

  function addPillar() {
    const num = config.length;
    setConfig((prev) => [
      ...prev,
      { id: `pillar_${num}`, label: "New Pillar", description: "", tags: [] },
    ]);
  }

  function removePillar(pillarId: string) {
    setConfig((prev) => prev.filter((p) => p.id !== pillarId));
  }

  if (config.length === 0) {
    return (
      <div className="mt-3">
        <span className="text-xs text-muted">No pillar config — generates after playbook sharpening</span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-accent hover:underline"
      >
        {isOpen ? "▾" : "▸"} Content Pillars ({config.length} pillars, {config.reduce((s, p) => s + p.tags.length, 0)} tags)
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1 rounded border border-border bg-background p-3">
          {config.map((pillar) => {
            const isExpanded = expanded === pillar.id;
            return (
              <div key={pillar.id} className="border-b border-border last:border-0">
                <button
                  onClick={() => setExpanded(isExpanded ? null : pillar.id)}
                  className="flex w-full items-center justify-between py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{pillar.label}</span>
                    <span className="text-[10px] text-muted">{pillar.tags.length} tags</span>
                  </div>
                  <span className="text-[10px] text-muted">{isExpanded ? "▾" : "▸"}</span>
                </button>

                {isExpanded && (
                  <div className="pb-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] text-muted">Label</label>
                        <input
                          value={pillar.label}
                          onChange={(e) => updatePillar(pillar.id, "label", e.target.value)}
                          className="w-full text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] text-muted">ID</label>
                        <input value={pillar.id} className="w-full text-xs" disabled />
                      </div>
                    </div>
                    <div className="mt-1">
                      <label className="mb-0.5 block text-[10px] text-muted">AI Description</label>
                      <input
                        value={pillar.description}
                        onChange={(e) => updatePillar(pillar.id, "description", e.target.value)}
                        className="w-full text-xs"
                        placeholder="What AI reads for classification"
                      />
                    </div>

                    <div className="mt-2">
                      <label className="mb-1 block text-[10px] text-muted">Tags</label>
                      <div className="flex flex-wrap gap-1">
                        {pillar.tags.map((tag, i) => (
                          <div key={tag.id} className="flex items-center gap-0.5 rounded bg-surface-hover px-1.5 py-0.5">
                            <input
                              value={tag.label}
                              onChange={(e) => updateTag(pillar.id, i, e.target.value)}
                              className="w-20 bg-transparent text-[10px] outline-none"
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
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => removePillar(pillar.id)}
                      className="mt-2 text-[10px] text-danger hover:underline"
                    >
                      Remove pillar
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={addPillar}
              className="text-[10px] text-muted hover:text-foreground"
            >
              + Add Pillar
            </button>
            <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}
