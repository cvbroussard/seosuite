"use client";

import Link from "next/link";

export interface ChecklistState {
  connectedPlatforms: string[];
  allPlatforms: string[];
  hasPlaybook: boolean;
  assetCount: number;
  blogEnabled: boolean;
  autopilotActive: boolean;
}

const REQUIRED_ASSETS = 5;

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  gbp: "Google Business",
  youtube: "YouTube",
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export function OnboardingChecklist({ state, prefix }: { state: ChecklistState; prefix: string }) {
  const missingPlatforms = state.allPlatforms.filter(
    (p) => !state.connectedPlatforms.includes(p)
  );

  const steps = [
    {
      key: "platforms",
      label: "Connect all social platforms",
      done: missingPlatforms.length === 0,
      detail: missingPlatforms.length > 0
        ? `${state.connectedPlatforms.length} of ${state.allPlatforms.length} connected`
        : "All platforms connected",
      href: `${prefix}/accounts`,
      expandable: missingPlatforms.length > 0,
      missing: missingPlatforms,
    },
    {
      key: "playbook",
      label: "Complete Brand Intelligence",
      done: state.hasPlaybook,
      detail: state.hasPlaybook
        ? "Playbook generated"
        : "Builds your content voice and strategy",
      href: `${prefix}/brand`,
    },
    {
      key: "assets",
      label: `Upload ${REQUIRED_ASSETS}+ content assets`,
      done: state.assetCount >= REQUIRED_ASSETS,
      detail: `${state.assetCount} of ${REQUIRED_ASSETS} uploaded`,
      href: `${prefix}/capture`,
    },
    {
      key: "blog",
      label: "Enable your blog",
      done: state.blogEnabled,
      detail: state.blogEnabled
        ? "Blog is live"
        : "Your SEO engine",
      href: `${prefix}/settings`,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone && state.autopilotActive) {
    return null; // Checklist complete, autopilot running — hide
  }

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          {allDone ? "Ready to launch" : "Setup Progress"}
        </h3>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span style={{ fontSize: 13 }} className="text-muted">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {steps.map((step) => (
          <div key={step.key} className="mb-4">
            <Link
              href={step.href}
              className="flex items-start gap-3 transition-colors"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  marginTop: 2,
                  background: step.done ? "var(--color-success)" : "var(--color-surface-hover)",
                  color: step.done ? "#fff" : "var(--color-muted)",
                }}
              >
                {step.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: step.done ? "var(--color-muted)" : "var(--color-foreground)",
                  textDecoration: step.done ? "line-through" : "none",
                }}>
                  {step.label}
                </p>
                <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                  {step.detail}
                </p>
              </div>
            </Link>

            {/* Show missing platforms inline */}
            {"missing" in step && step.missing && step.missing.length > 0 && !step.done && (
              <div style={{ marginLeft: 32, marginTop: 6 }}>
                {(step.missing as string[]).map((platform) => (
                  <div
                    key={platform}
                    style={{
                      fontSize: 13,
                      color: "var(--color-muted)",
                      padding: "3px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-warning)", flexShrink: 0 }} />
                    {PLATFORM_LABELS[platform] || platform}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Autopilot status */}
        <div
          style={{
            marginTop: 16,
            padding: "12px",
            borderRadius: "var(--tp-radius)",
            background: allDone ? "rgba(34, 197, 94, 0.1)" : "var(--color-surface-hover)",
          }}
        >
          {allDone ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-success)" }}>
                Autopilot is ready
              </p>
              <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>
                Your content engine will begin publishing automatically.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 500 }}>
                Autopilot activates when setup is complete
              </p>
              <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>
                {steps.length - completedCount} step{steps.length - completedCount !== 1 ? "s" : ""} remaining
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
