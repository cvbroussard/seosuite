"use client";

import { useState, useEffect } from "react";

interface Product {
  id: string;
  name: string;
  tagline: string | null;
  price: string;
  frequency: string;
  features: string[];
  cta_text: string;
  cta_href: string | null;
  highlight: boolean;
  sort_order: number;
  stripe_price_id: string | null;
  is_active: boolean;
}

const EMPTY: Omit<Product, "id" | "is_active"> = {
  name: "",
  tagline: "",
  price: "",
  frequency: "/month",
  features: [],
  cta_text: "Start 14-day trial",
  cta_href: null,
  highlight: false,
  sort_order: 0,
  stripe_price_id: null,
};

export function ProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState("");

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    const res = await fetch("/api/admin/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
    }
    setLoading(false);
  }

  function startCreate() {
    setEditing({ id: "", is_active: true, ...EMPTY });
    setCreating(true);
    setFeatureInput("");
  }

  function startEdit(p: Product) {
    setEditing({ ...p });
    setCreating(false);
    setFeatureInput("");
  }

  function cancelEdit() {
    setEditing(null);
    setCreating(false);
  }

  function updateField(key: string, value: unknown) {
    if (!editing) return;
    setEditing({ ...editing, [key]: value });
  }

  function addFeature() {
    if (!featureInput.trim() || !editing) return;
    updateField("features", [...editing.features, featureInput.trim()]);
    setFeatureInput("");
  }

  function removeFeature(idx: number) {
    if (!editing) return;
    updateField("features", editing.features.filter((_, i) => i !== idx));
  }

  function moveFeature(idx: number, dir: -1 | 1) {
    if (!editing) return;
    const next = [...editing.features];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    updateField("features", next);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);

    const method = creating ? "POST" : "PATCH";
    const res = await fetch("/api/admin/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });

    if (res.ok) {
      await loadProducts();
      setEditing(null);
      setCreating(false);
    }
    setSaving(false);
  }

  async function deactivate(id: string) {
    await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadProducts();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Products</h1>
          <p className="text-xs text-muted">Pricing plans shown on the marketing site</p>
        </div>
        <button onClick={startCreate} className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
          New Product
        </button>
      </div>

      {/* Product cards */}
      <div className="grid grid-cols-3 gap-4">
        {products.filter(p => p.is_active).map(p => (
          <div
            key={p.id}
            className={`rounded-xl border bg-surface p-5 shadow-card cursor-pointer transition-colors hover:border-accent/30 ${
              p.highlight ? "border-accent" : "border-border"
            }`}
            onClick={() => startEdit(p)}
          >
            {p.highlight && (
              <span className="mb-2 inline-block rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Recommended</span>
            )}
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-xs text-muted mt-0.5">{p.tagline}</p>
            <p className="mt-3">
              <span className="text-2xl font-bold">{p.price}</span>
              <span className="text-xs text-muted">{p.frequency}</span>
            </p>
            <ul className="mt-3 space-y-1">
              {p.features.map((f, i) => (
                <li key={i} className="text-xs text-muted flex items-start gap-1.5">
                  <span className="text-success mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className={`rounded px-2 py-0.5 text-[10px] ${
                p.cta_href ? "bg-surface-hover text-muted" : "bg-accent/10 text-accent"
              }`}>
                {p.cta_text}
              </span>
              <span className="text-[10px] text-muted">#{p.sort_order}</span>
            </div>
            {p.stripe_price_id && (
              <p className="mt-2 text-[9px] text-muted font-mono truncate">{p.stripe_price_id}</p>
            )}
          </div>
        ))}
      </div>

      {/* Inactive products */}
      {products.filter(p => !p.is_active).length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">Inactive</p>
          {products.filter(p => !p.is_active).map(p => (
            <div key={p.id} className="flex items-center justify-between rounded border border-border bg-surface p-3 mb-1 opacity-50">
              <span className="text-sm">{p.name} — {p.price}</span>
              <button
                onClick={() => {
                  fetch("/api/admin/products", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...p, is_active: true }),
                  }).then(() => loadProducts());
                }}
                className="text-[10px] text-accent hover:underline"
              >
                Reactivate
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12" onClick={cancelEdit}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{creating ? "New Product" : `Edit: ${editing.name}`}</h2>
              <button onClick={cancelEdit} className="text-muted hover:text-foreground">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted mb-1">Name</label>
                  <input
                    value={editing.name}
                    onChange={e => updateField("name", e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="Growth"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={editing.sort_order}
                    onChange={e => updateField("sort_order", Number(e.target.value))}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-muted mb-1">Tagline</label>
                <input
                  value={editing.tagline || ""}
                  onChange={e => updateField("tagline", e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Own your category."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted mb-1">Price</label>
                  <input
                    value={editing.price}
                    onChange={e => updateField("price", e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="$219"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-1">Frequency</label>
                  <input
                    value={editing.frequency}
                    onChange={e => updateField("frequency", e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="/month"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted mb-1">CTA Text</label>
                  <input
                    value={editing.cta_text}
                    onChange={e => updateField("cta_text", e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="Start 14-day trial"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-1">CTA Link (blank = checkout)</label>
                  <input
                    value={editing.cta_href || ""}
                    onChange={e => updateField("cta_href", e.target.value || null)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="/contact"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-muted mb-1">Stripe Price ID</label>
                <input
                  value={editing.stripe_price_id || ""}
                  onChange={e => updateField("stripe_price_id", e.target.value || null)}
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm font-mono"
                  placeholder="price_1Abc..."
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editing.highlight}
                    onChange={e => updateField("highlight", e.target.checked)}
                  />
                  Highlight (recommended badge)
                </label>
              </div>

              {/* Features */}
              <div>
                <label className="block text-[10px] text-muted mb-1">Features ({editing.features.length})</label>
                <div className="space-y-1 mb-2">
                  {editing.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted w-4 text-right">{i + 1}</span>
                      <span className="flex-1 text-xs">{f}</span>
                      <button onClick={() => moveFeature(i, -1)} disabled={i === 0} className="text-[10px] text-muted hover:text-foreground disabled:opacity-30">↑</button>
                      <button onClick={() => moveFeature(i, 1)} disabled={i === editing.features.length - 1} className="text-[10px] text-muted hover:text-foreground disabled:opacity-30">↓</button>
                      <button onClick={() => removeFeature(i)} className="text-[10px] text-danger hover:underline">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={featureInput}
                    onChange={e => setFeatureInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } }}
                    className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-xs"
                    placeholder="Add a feature..."
                  />
                  <button onClick={addFeature} disabled={!featureInput.trim()} className="rounded bg-surface-hover px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50">
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <div>
                {!creating && (
                  <button
                    onClick={() => { deactivate(editing.id); cancelEdit(); }}
                    className="text-xs text-danger hover:underline"
                  >
                    Deactivate
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={cancelEdit} className="rounded border border-border px-4 py-1.5 text-xs text-muted hover:text-foreground">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !editing.name || !editing.price}
                  className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? "Saving..." : creating ? "Create" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
