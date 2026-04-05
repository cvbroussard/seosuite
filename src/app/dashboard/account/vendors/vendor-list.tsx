"use client";

import { useState } from "react";

interface Vendor {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  created_at: string;
}

export function VendorList({ initialVendors, siteId }: { initialVendors: Vendor[]; siteId: string }) {
  const [vendors, setVendors] = useState(initialVendors);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  async function addVendor() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim() || null, site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setVendors((prev) => [...prev, data.vendor].sort((a, b) => a.name.localeCompare(b.name)));
        setNewName("");
        setNewUrl("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function updateVendor(id: string) {
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), url: editUrl.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setVendors((prev) =>
          prev.map((v) => (v.id === id ? data.vendor : v)).sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditing(null);
      }
    } catch { /* ignore */ }
  }

  async function deleteVendor(id: string) {
    try {
      await fetch(`/api/vendors/${id}`, { method: "DELETE" });
      setVendors((prev) => prev.filter((v) => v.id !== id));
    } catch { /* ignore */ }
  }

  function startEdit(vendor: Vendor) {
    setEditing(vendor.id);
    setEditName(vendor.name);
    setEditUrl(vendor.url || "");
  }

  return (
    <>
      {/* Add vendor */}
      <div className="mb-8 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addVendor()}
          className="flex-1 text-sm"
          placeholder="Vendor name"
        />
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addVendor()}
          className="flex-1 text-sm"
          placeholder="https://vendor-website.com"
        />
        <button
          onClick={addVendor}
          disabled={adding || !newName.trim()}
          className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>

      {/* Vendor list */}
      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No vendors yet. Add your first vendor above.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {vendors.map((vendor) => (
            <div
              key={vendor.id}
              className="flex items-center gap-4 border-b border-border py-3 last:border-0"
            >
              {editing === vendor.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && updateVendor(vendor.id)}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && updateVendor(vendor.id)}
                    className="flex-1 text-sm"
                    placeholder="https://..."
                  />
                  <button
                    onClick={() => updateVendor(vendor.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{vendor.name}</p>
                    {vendor.url && (
                      <a
                        href={vendor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        {vendor.url}
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-muted">{vendor.slug}</span>
                  <button
                    onClick={() => startEdit(vendor)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteVendor(vendor.id)}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
