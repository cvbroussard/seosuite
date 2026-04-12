"use client";

import { useState } from "react";

interface Props {
  initial: {
    business_phone: string | null;
    business_email: string | null;
    business_logo: string | null;
  };
}

export function BusinessInfo({ initial }: Props) {
  const [phone, setPhone] = useState(initial.business_phone || "");
  const [email, setEmail] = useState(initial.business_email || "");
  const [logo, setLogo] = useState(initial.business_logo || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/business-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_phone: phone || null,
          business_email: email || null,
          business_logo: logo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Request failed");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        These details appear on your website, blog, and project pages.
      </p>

      <div>
        <label className="mb-1 block text-xs text-muted">Business Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full text-sm"
          placeholder="(412) 555-0100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">
          Business Email
          <span className="ml-1 text-dim">— used for contact form messages</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-sm"
          placeholder="info@b2construct.com"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">
          Logo URL
          <span className="ml-1 text-dim">— displayed in header</span>
        </label>
        <input
          type="url"
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          className="w-full text-sm"
          placeholder="https://..."
        />
        {logo && (
          <div className="mt-2 inline-block rounded border border-border p-2 bg-surface">
            <img src={logo} alt="Logo preview" className="h-12 w-auto" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-xs text-success">Saved</span>}
        {error && <span className="text-xs text-warning">{error}</span>}
      </div>
    </div>
  );
}
