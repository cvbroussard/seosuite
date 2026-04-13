"use client";

import { useState, useRef } from "react";

interface Props {
  initial: {
    name: string;
    business_type: string | null;
    location: string | null;
    business_phone: string | null;
    business_email: string | null;
    business_logo: string | null;
    business_favicon: string | null;
  };
}

export function BusinessInfo({ initial }: Props) {
  const [name, setName] = useState(initial.name);
  const [businessType, setBusinessType] = useState(initial.business_type || "");
  const [location, setLocation] = useState(initial.location || "");
  const [phone, setPhone] = useState(initial.business_phone || "");
  const [email, setEmail] = useState(initial.business_email || "");
  const [logoUrl, setLogoUrl] = useState(initial.business_logo || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState(initial.business_favicon || "");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Logo must be an image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2MB");
      return;
    }

    setError(null);
    setLogoFile(file);
    // Local preview using FileReader
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFaviconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "image/x-icon") {
      setError("Favicon must be an image");
      return;
    }
    if (file.size > 256 * 1024) {
      setError("Favicon must be under 256KB");
      return;
    }
    setError(null);
    setFaviconFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFaviconPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeFavicon() {
    setFaviconFile(null);
    setFaviconPreview(null);
    setFaviconUrl("");
    if (faviconInputRef.current) faviconInputRef.current.value = "";
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("business_type", businessType);
    formData.set("location", location);
    formData.set("business_phone", phone);
    formData.set("business_email", email);
    if (logoFile) {
      formData.set("business_logo", logoFile);
    } else {
      formData.set("business_logo_url", logoUrl);
    }
    if (faviconFile) {
      formData.set("business_favicon", faviconFile);
    } else {
      formData.set("business_favicon_url", faviconUrl);
    }

    try {
      const res = await fetch("/api/dashboard/business-info", {
        method: "POST",
        body: formData,
      });
      let data;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        setError(data?.error || `Failed to save (HTTP ${res.status})`);
      } else if (data?.error) {
        setError(data.error);
      } else {
        setSaved(true);
        setLogoFile(null);
        if (data.business_logo) setLogoUrl(data.business_logo);
        setLogoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setFaviconFile(null);
        if (data.business_favicon) setFaviconUrl(data.business_favicon);
        setFaviconPreview(null);
        if (faviconInputRef.current) faviconInputRef.current.value = "";
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Request failed");
    }
    setSaving(false);
  }

  const displayLogo = logoPreview || logoUrl;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        These details appear on your website, blog, and project pages.
      </p>

      <div>
        <label className="mb-1 block text-xs text-muted">Site Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm"
          placeholder="Your business name"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Business Type</label>
          <input
            type="text"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="w-full text-sm"
            placeholder="Residential Remodeling"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full text-sm"
            placeholder="Pittsburgh, PA"
          />
        </div>
      </div>

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
          Logo
          <span className="ml-1 text-dim">— PNG, JPG, SVG, or WebP, under 2MB</span>
        </label>

        {displayLogo ? (
          <div className="flex items-start gap-3">
            <div className="rounded border border-border bg-surface p-2">
              <img src={displayLogo} alt="Logo" className="h-16 w-auto object-contain" />
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-accent hover:underline text-left"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={removeLogo}
                className="text-xs text-muted hover:text-foreground text-left"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-dashed border-border bg-surface px-4 py-6 text-xs text-muted hover:border-accent hover:text-accent w-full"
          >
            Click to upload logo
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">
          Favicon
          <span className="ml-1 text-dim">— square image, ICO/PNG/SVG, under 256KB. Shows in browser tabs.</span>
        </label>

        {(faviconPreview || faviconUrl) ? (
          <div className="flex items-start gap-3">
            <div className="rounded border border-border bg-surface p-2">
              <img src={faviconPreview || faviconUrl} alt="Favicon" className="h-12 w-12 object-contain" />
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => faviconInputRef.current?.click()}
                className="text-xs text-accent hover:underline text-left"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={removeFavicon}
                className="text-xs text-muted hover:text-foreground text-left"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => faviconInputRef.current?.click()}
            className="rounded border border-dashed border-border bg-surface px-4 py-6 text-xs text-muted hover:border-accent hover:text-accent w-full"
          >
            Click to upload favicon
          </button>
        )}

        <input
          ref={faviconInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/x-icon,image/webp"
          onChange={handleFaviconSelect}
          className="hidden"
        />
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
