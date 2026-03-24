"use client";

import { useState } from "react";
import type { ProfileKit } from "@/lib/provisioning/profile-kit";

export function ProfileKitPanel({ kit }: { kit: ProfileKit }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
      >
        {expanded ? "▾" : "▸"} Profile Kit
      </button>

      {expanded && (
        <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface p-4">
          {/* Handle suggestions */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Handle Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {kit.handleSuggestions.map((h) => (
                <button
                  key={h}
                  onClick={() => copyText(h, h)}
                  className="rounded bg-surface-hover px-2 py-1 font-mono text-xs text-foreground hover:bg-accent/10"
                  title="Click to copy"
                >
                  {h}
                  {copied === h && <span className="ml-1 text-success">copied</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Hub page link */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Link in bio</span>
            <button
              onClick={() => copyText(kit.hubPageUrl, "hub")}
              className="font-mono text-xs text-accent hover:underline"
            >
              {kit.hubPageUrl}
              {copied === "hub" && <span className="ml-1 text-success">copied</span>}
            </button>
          </div>

          {/* Brand tone + tagline */}
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Tagline</span>
              <button
                onClick={() => copyText(kit.tagline, "tagline")}
                className="max-w-xs text-right text-xs hover:text-accent"
              >
                {kit.tagline}
                {copied === "tagline" && <span className="ml-1 text-success">copied</span>}
              </button>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Tone</span>
              <span className="max-w-xs text-right text-xs">{kit.brandTone}</span>
            </div>
          </div>

          {/* Content pillars */}
          {kit.contentPillars.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Content Pillars</p>
              <div className="flex flex-wrap gap-1">
                {kit.contentPillars.map((p) => (
                  <span key={p} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Per-platform profiles */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Platform Profiles</p>
            <div className="space-y-3">
              {kit.platforms.map((p) => (
                <PlatformCard
                  key={p.platform}
                  profile={p}
                  onCopy={copyText}
                  copied={copied}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformCard({
  profile,
  onCopy,
  copied,
}: {
  profile: ProfileKit["platforms"][0];
  onCopy: (text: string, label: string) => void;
  copied: string | null;
}) {
  const [open, setOpen] = useState(false);
  const bioKey = `bio-${profile.platform}`;

  return (
    <div className="rounded border border-border bg-background">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
      >
        <span className="font-medium">{profile.label}</span>
        <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-3 text-xs">
          {/* Handle */}
          <div className="flex justify-between">
            <span className="text-muted">Handle</span>
            <button
              onClick={() => onCopy(profile.handle, `handle-${profile.platform}`)}
              className="font-mono hover:text-accent"
            >
              {profile.handle}
              {copied === `handle-${profile.platform}` && <span className="ml-1 text-success">copied</span>}
            </button>
          </div>

          {/* Category */}
          <div className="flex justify-between">
            <span className="text-muted">Category</span>
            <button
              onClick={() => onCopy(profile.category, `cat-${profile.platform}`)}
              className="hover:text-accent"
            >
              {profile.category}
              {copied === `cat-${profile.platform}` && <span className="ml-1 text-success">copied</span>}
            </button>
          </div>

          {/* Location */}
          {profile.location && (
            <div className="flex justify-between">
              <span className="text-muted">Location</span>
              <span>{profile.location}</span>
            </div>
          )}

          {/* Website */}
          {profile.websiteLink && (
            <div className="flex justify-between">
              <span className="text-muted">Website</span>
              <button
                onClick={() => onCopy(profile.websiteLink, `url-${profile.platform}`)}
                className="font-mono hover:text-accent"
              >
                {profile.websiteLink}
                {copied === `url-${profile.platform}` && <span className="ml-1 text-success">copied</span>}
              </button>
            </div>
          )}

          {/* Bio */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted">Bio ({profile.bio.length} chars)</span>
              <button
                onClick={() => onCopy(profile.bio, bioKey)}
                className="text-accent hover:underline"
              >
                {copied === bioKey ? "copied" : "copy"}
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded bg-surface-hover p-2 text-xs leading-relaxed">
              {profile.bio}
            </div>
          </div>

          {/* Setup notes */}
          <p className="text-[10px] italic text-muted">{profile.notes}</p>
        </div>
      )}
    </div>
  );
}
