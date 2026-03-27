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

export function PillarConfigEditor({
  siteId,
  initialConfig,
}: {
  siteId: string;
  initialConfig: Pillar[];
}) {
  const [config, setConfig] = useState<Pillar[]>(initialConfig);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/dashboard/pillar-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, config }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updatePillar(pillarId: string, field: keyof Pillar, value: string) {
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
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
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

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2>Content Pillars</h2>
          <p className="mt-1 text-xs text-muted">
            Pillars organize your content. Tags within each pillar guide AI content generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-muted">Saving...</span>}
          {saved && <span className="text-[10px] text-success">Saved</span>}
          <button
            onClick={save}
            className="bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>

      <div>
        {config.map((pillar) => {
          const isOpen = expanded === pillar.id;
          return (
            <div key={pillar.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setExpanded(isOpen ? null : pillar.id)}
                className="flex w-full items-center justify-between py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{pillar.label}</span>
                  <span className="text-[10px] text-muted">{pillar.tags.length} tags</span>
                </div>
                <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="pb-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-muted">Label</label>
                      <input
                        value={pillar.label}
                        onChange={(e) => updatePillar(pillar.id, "label", e.target.value)}
                        className="w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted">ID</label>
                      <input
                        value={pillar.id}
                        className="w-full text-sm"
                        disabled
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] text-muted">Description (AI reads this)</label>
                    <input
                      value={pillar.description}
                      onChange={(e) => updatePillar(pillar.id, "description", e.target.value)}
                      className="w-full text-sm"
                      placeholder="What content belongs in this pillar?"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1.5 block text-[10px] text-muted">Tags</label>
                    <div className="flex flex-wrap gap-1.5">
                      {pillar.tags.map((tag, i) => (
                        <div
                          key={tag.id}
                          className="flex items-center gap-1 rounded bg-surface-hover px-2 py-1"
                        >
                          <input
                            value={tag.label}
                            onChange={(e) => updateTag(pillar.id, i, e.target.value)}
                            className="w-24 bg-transparent text-[11px] outline-none"
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
                        className="rounded bg-surface-hover px-2 py-1 text-[11px] text-muted hover:text-foreground"
                      >
                        + Tag
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => removePillar(pillar.id)}
                    className="mt-3 text-xs text-danger hover:underline"
                  >
                    Remove pillar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addPillar}
        className="mt-3 border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        + Add Pillar
      </button>
    </section>
  );
}
