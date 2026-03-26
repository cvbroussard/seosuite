"use client";

import { useState } from "react";

interface Settings {
  auto_handle_compliments: boolean;
  veto_window_hours: number;
  notify_pipeline: boolean;
  notify_reviews: boolean;
  notify_comments: boolean;
  notify_veto: boolean;
  notify_blog: boolean;
  capture_default_pillar: string | null;
  capture_max_video_seconds: number;
}

export function MobileSettings({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  async function save(partial: Partial<Settings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    setSaving(true);
    setSaved(false);

    await fetch("/api/dashboard/mobile-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="mb-8">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <h2>App Settings</h2>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-muted">Saving...</span>}
          {saved && <span className="text-[10px] text-success">Saved</span>}
          <span className="text-xs text-muted">{collapsed ? "▸" : "▾"}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-6 pb-4">
          {/* Auto-Response */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Auto-Response</h3>
            <div className="space-y-3">
              <ToggleRow
                label="Auto-handle compliments"
                description="AI responds to positive comments automatically. You can review in the Auto-handled tab."
                checked={settings.auto_handle_compliments}
                onChange={(v) => save({ auto_handle_compliments: v })}
              />
              <div className="flex items-baseline justify-between border-b border-border py-2">
                <div>
                  <p className="text-sm">Draft responses to questions</p>
                  <p className="text-[11px] text-dim">AI drafts, you approve — never auto-sent</p>
                </div>
                <span className="text-[10px] text-success">Always on</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border py-2">
                <div>
                  <p className="text-sm">Alert on negative sentiment</p>
                  <p className="text-[11px] text-dim">Push notification + red flag — never auto-responded</p>
                </div>
                <span className="text-[10px] text-success">Always on</span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Notifications</h3>
            <div className="space-y-3">
              <ToggleRow
                label="Pipeline results"
                description="Assets triaged, posts published"
                checked={settings.notify_pipeline}
                onChange={(v) => save({ notify_pipeline: v })}
              />
              <ToggleRow
                label="New reviews"
                description="Always on for negative reviews"
                checked={settings.notify_reviews}
                onChange={(v) => save({ notify_reviews: v })}
              />
              <ToggleRow
                label="New comments"
                description="Comments on published posts"
                checked={settings.notify_comments}
                onChange={(v) => save({ notify_comments: v })}
              />
              <ToggleRow
                label="Veto window alerts"
                description="Posts approaching scheduled publish time"
                checked={settings.notify_veto}
                onChange={(v) => save({ notify_veto: v })}
              />
              <ToggleRow
                label="Blog posts published"
                description="New blog content goes live"
                checked={settings.notify_blog}
                onChange={(v) => save({ notify_blog: v })}
              />
            </div>
          </div>

          {/* Veto Window */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Veto Window</h3>
            <p className="mb-2 text-xs text-muted">
              How many hours before a scheduled post to alert you for review. Set to 0 to disable.
            </p>
            <div className="flex gap-2">
              {[0, 2, 4, 8, 24].map((hours) => (
                <button
                  key={hours}
                  onClick={() => save({ veto_window_hours: hours })}
                  className={`flex-1 py-2 text-xs font-medium ${
                    settings.veto_window_hours === hours
                      ? "bg-accent/10 text-accent"
                      : "bg-surface-hover text-muted"
                  }`}
                >
                  {hours === 0 ? "Off" : `${hours}h`}
                </button>
              ))}
            </div>
          </div>

          {/* Capture */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Capture</h3>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-border py-2">
                <span className="text-sm">Max video duration</span>
                <div className="flex gap-2">
                  {[15, 30, 60, 0].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => save({ capture_max_video_seconds: sec })}
                      className={`px-2 py-1 text-xs font-medium ${
                        settings.capture_max_video_seconds === sec
                          ? "bg-accent/10 text-accent"
                          : "bg-surface-hover text-muted"
                      }`}
                    >
                      {sec === 0 ? "No limit" : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-dim">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
