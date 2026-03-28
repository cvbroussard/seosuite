"use client";

import { useState } from "react";

interface Settings {
  blog_enabled: boolean;
  subdomain: string | null;
  custom_domain: string | null;
  blog_title: string | null;
  blog_description: string | null;
}

export function BlogSettings({
  siteId,
  initialSettings,
}: {
  siteId: string;
  initialSettings: Settings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(!settings.blog_enabled);
  const [title, setTitle] = useState(settings.blog_title || "");
  const [description, setDescription] = useState(settings.blog_description || "");
  const [subdomain, setSubdomain] = useState(settings.subdomain || "");

  async function saveSettings(enabled?: boolean) {
    setSaving(true);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          site_id: siteId,
          blog_enabled: enabled ?? settings.blog_enabled,
          blog_title: title || null,
          blog_description: description || null,
          subdomain: subdomain || null,
        }),
      });
      setSettings((s) => ({
        ...s,
        blog_enabled: enabled ?? s.blog_enabled,
        blog_title: title || null,
        blog_description: description || null,
        subdomain: subdomain || null,
      }));
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Blog Settings</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
              settings.blog_enabled
                ? "bg-success/20 text-success"
                : "bg-surface-hover text-muted"
            }`}
          >
            {settings.blog_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
      </button>

      {isOpen && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Blog Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm"
                placeholder="My Blog"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Subdomain</label>
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                className="w-full text-sm"
                placeholder="blog.yourdomain.com"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-sm"
                placeholder="Latest updates and insights"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => saveSettings()}
              disabled={saving}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              onClick={() => saveSettings(!settings.blog_enabled)}
              className="px-4 py-2 text-xs text-muted hover:text-foreground"
            >
              {settings.blog_enabled ? "Disable Blog" : "Enable Blog"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
