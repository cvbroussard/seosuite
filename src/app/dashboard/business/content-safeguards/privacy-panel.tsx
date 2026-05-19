"use client";

import { useState } from "react";

/**
 * Three-axis content safeguards panel.
 *
 * Adult faces, minor faces, and identity (names) are independent
 * decisions. Each axis has a conservative default (no waiver) and a
 * permissive option (waiver required). The minor face waiver is
 * meaningfully stronger than the adult face waiver — it affirms
 * parental / legal-guardian consent rather than generic publisher-of-
 * record responsibility.
 *
 * UI: three cards, each with policy radios + waiver state + sign/revoke
 * affordance. Permissive options open a waiver modal before applying.
 * Modal supports multi-axis ceremonies (initial visit could surface
 * any or all of the three).
 */

interface AxisState {
  policy: string;
  waiver_signed_at: string | null;
  waiver_version: string | null;
}

type AxisKey = "face" | "minor_face" | "identity";

interface Props {
  siteId: string;
  initial: { face: AxisState; minor_face: AxisState; identity: AxisState };
}

const FACE_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "blur",
    label: "Blur faces (default)",
    description:
      "Every detected adult face is gaussian-blurred at publish time. Safe by default — no consent or waiver concerns.",
    requiresWaiver: false,
  },
  {
    value: "box",
    label: "Rectangle overlay",
    description:
      "Each detected adult face is covered by a solid rectangle. Editorial / stylistic choice that preserves anonymity while showing people are present.",
    requiresWaiver: false,
  },
  {
    value: "suppress",
    label: "Don't publish images with adult faces",
    description:
      "Assets containing detected adult faces are quarantined from autopilot publishing. Most conservative; you'd manually compose for the rare face-OK shot.",
    requiresWaiver: false,
  },
  {
    value: "asis",
    label: "Publish adult faces unaltered",
    description:
      "Adult faces appear as-is in published images. Opt into this if you have consent from the people in your uploads (crew, clients who agreed to be featured, public-figure context). Because TracPost's autopilot is the publisher-of-record, you sign a one-time waiver accepting responsibility for the consent status of every adult whose face appears in your published content.",
    requiresWaiver: true,
  },
];

const MINOR_FACE_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "blur",
    label: "Blur minor faces (default)",
    description:
      "Every face flagged as potentially under 18 is gaussian-blurred — independent of your adult face policy. The safe default for any business that occasionally captures minors in the background (or whose work routinely involves families).",
    requiresWaiver: false,
  },
  {
    value: "box",
    label: "Rectangle overlay on minor faces",
    description:
      "Each detected minor face is covered by a solid rectangle. Recognizable people-are-present signal without the parental-consent burden of as-is.",
    requiresWaiver: false,
  },
  {
    value: "suppress",
    label: "Don't publish images with minor faces",
    description:
      "Assets containing any face flagged as potentially under 18 are quarantined from autopilot publishing. The strictest minor-protection setting.",
    requiresWaiver: false,
  },
  {
    value: "asis",
    label: "Publish minor faces unaltered",
    description:
      "Minor faces appear as-is in published images. Sign this waiver only if you have verifiable parental or legal-guardian consent for every minor whose face will be published. The waiver is non-trivial by design — TracPost is asking you to be sure, because parental consent is a higher legal bar than adult consent.",
    requiresWaiver: true,
  },
];

const IDENTITY_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "anonymize",
    label: "Anonymize names (default)",
    description:
      "Captions substitute generic role descriptors (\"our client installed her new cabinets\") even when you mention real names in the transcript. Safe by default — no consent concerns.",
    requiresWaiver: false,
  },
  {
    value: "allow_names",
    label: "Use proper names",
    description:
      "Captions preserve real names from your transcripts (\"Mike installed the new cabinets\"). Opt into this for crew attribution and testimonials. Your audio + transcript is the consent record — you mentioned the name in your own voice. One-time waiver acknowledges publisher-of-record responsibility for published name mentions.",
    requiresWaiver: true,
  },
];

type OptionList = typeof FACE_OPTIONS;

function needsSigning(axis: AxisState, options: OptionList): boolean {
  const opt = options.find((o) => o.value === axis.policy);
  return Boolean(opt?.requiresWaiver) && !axis.waiver_signed_at;
}

export function PrivacyPanel({ siteId, initial }: Props) {
  const [face, setFace] = useState<AxisState>(initial.face);
  const [minorFace, setMinorFace] = useState<AxisState>(initial.minor_face);
  const [identity, setIdentity] = useState<AxisState>(initial.identity);
  const [modalAxes, setModalAxes] = useState<AxisKey[]>([]);
  const [faceChecked, setFaceChecked] = useState(false);
  const [minorFaceChecked, setMinorFaceChecked] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePolicy(opts: {
    face_policy?: string;
    minor_face_policy?: string;
    identity_policy?: string;
    sign_face_waiver?: boolean;
    sign_minor_face_waiver?: boolean;
    sign_identity_waiver?: boolean;
  }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/site/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const fresh = await fetch(`/api/site/privacy?site_id=${siteId}`);
      const freshData = await fresh.json();
      setFace(freshData.face);
      setMinorFace(freshData.minor_face);
      setIdentity(freshData.identity);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleFaceChange(nextValue: string) {
    const opt = FACE_OPTIONS.find((o) => o.value === nextValue);
    if (!opt) return;
    if (opt.requiresWaiver && !face.waiver_signed_at) {
      setFace({ ...face, policy: nextValue });
      setModalAxes(["face"]);
      setFaceChecked(false);
      return;
    }
    void savePolicy({ face_policy: nextValue });
  }

  function handleMinorFaceChange(nextValue: string) {
    const opt = MINOR_FACE_OPTIONS.find((o) => o.value === nextValue);
    if (!opt) return;
    if (opt.requiresWaiver && !minorFace.waiver_signed_at) {
      setMinorFace({ ...minorFace, policy: nextValue });
      setModalAxes(["minor_face"]);
      setMinorFaceChecked(false);
      return;
    }
    void savePolicy({ minor_face_policy: nextValue });
  }

  function handleIdentityChange(nextValue: string) {
    const opt = IDENTITY_OPTIONS.find((o) => o.value === nextValue);
    if (!opt) return;
    if (opt.requiresWaiver && !identity.waiver_signed_at) {
      setIdentity({ ...identity, policy: nextValue });
      setModalAxes(["identity"]);
      setIdentityChecked(false);
      return;
    }
    void savePolicy({ identity_policy: nextValue });
  }

  async function confirmWaivers() {
    const opts: Parameters<typeof savePolicy>[0] = {};
    if (modalAxes.includes("face") && faceChecked) {
      opts.face_policy = face.policy;
      opts.sign_face_waiver = true;
    }
    if (modalAxes.includes("minor_face") && minorFaceChecked) {
      opts.minor_face_policy = minorFace.policy;
      opts.sign_minor_face_waiver = true;
    }
    if (modalAxes.includes("identity") && identityChecked) {
      opts.identity_policy = identity.policy;
      opts.sign_identity_waiver = true;
    }
    if (Object.keys(opts).length === 0) return;
    await savePolicy(opts);
    setModalAxes([]);
    setFaceChecked(false);
    setMinorFaceChecked(false);
    setIdentityChecked(false);
  }

  function dismissModal() {
    setModalAxes([]);
    setFaceChecked(false);
    setMinorFaceChecked(false);
    setIdentityChecked(false);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <AxisCard
        title="Adult faces in images"
        currentPolicy={face.policy}
        options={FACE_OPTIONS}
        waiverSignedAt={face.waiver_signed_at}
        waiverVersion={face.waiver_version}
        onChange={handleFaceChange}
        disabled={saving}
        needsSigning={needsSigning(face, FACE_OPTIONS)}
      />

      <AxisCard
        title="Minor faces in images"
        currentPolicy={minorFace.policy}
        options={MINOR_FACE_OPTIONS}
        waiverSignedAt={minorFace.waiver_signed_at}
        waiverVersion={minorFace.waiver_version}
        onChange={handleMinorFaceChange}
        disabled={saving}
        needsSigning={needsSigning(minorFace, MINOR_FACE_OPTIONS)}
        accent="strong"
        subtitle="Faces flagged as potentially under 18 are routed through this axis — independent of the adult face policy above."
      />

      <AxisCard
        title="Names in captions"
        currentPolicy={identity.policy}
        options={IDENTITY_OPTIONS}
        waiverSignedAt={identity.waiver_signed_at}
        waiverVersion={identity.waiver_version}
        onChange={handleIdentityChange}
        disabled={saving}
        needsSigning={needsSigning(identity, IDENTITY_OPTIONS)}
      />

      {modalAxes.length > 0 && (
        <WaiverModal
          axes={modalAxes}
          faceChecked={faceChecked}
          minorFaceChecked={minorFaceChecked}
          identityChecked={identityChecked}
          onFaceCheckedChange={setFaceChecked}
          onMinorFaceCheckedChange={setMinorFaceChecked}
          onIdentityCheckedChange={setIdentityChecked}
          onConfirm={confirmWaivers}
          onCancel={dismissModal}
          saving={saving}
        />
      )}
    </div>
  );
}

function AxisCard({
  title,
  subtitle,
  currentPolicy,
  options,
  waiverSignedAt,
  waiverVersion,
  onChange,
  disabled,
  needsSigning,
  accent = "default",
}: {
  title: string;
  subtitle?: string;
  currentPolicy: string;
  options: OptionList;
  waiverSignedAt: string | null;
  waiverVersion: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
  needsSigning: boolean;
  accent?: "default" | "strong";
}) {
  const cardClass =
    accent === "strong"
      ? "rounded-lg border border-accent/30 bg-surface p-4"
      : "rounded-lg border border-border bg-surface p-4";
  return (
    <section className={cardClass}>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-muted">{subtitle}</p>}
      {needsSigning && (
        <div className="mb-3 rounded border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          ⚠ This option requires a waiver. Until signed, the conservative fallback applies at publish time.
        </div>
      )}
      <div className="space-y-2">
        {options.map((opt) => {
          const isCurrent = opt.value === currentPolicy;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 transition-colors ${
                isCurrent
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                checked={isCurrent}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                className="mt-0.5 cursor-pointer accent-accent"
              />
              <div className="flex-1 text-xs">
                <div className="font-medium">
                  {opt.label}
                  {opt.requiresWaiver && (
                    <span className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
                      waiver required
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-muted">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      {waiverSignedAt && (
        <p className="mt-3 text-[10px] text-muted">
          Waiver signed {new Date(waiverSignedAt).toLocaleString()}{" "}
          {waiverVersion && <span className="opacity-60">({waiverVersion})</span>}
        </p>
      )}
    </section>
  );
}

/**
 * Unified waiver modal — handles 1, 2, or 3 axes in a single ceremony.
 *
 * Each section is independently signable. Subscriber can sign any
 * subset (dismissing without signing is allowed — they can come back).
 * The minor face waiver text is meaningfully stronger than the adult
 * waiver: parental / legal-guardian consent affirmation, plus a line
 * about subscriber's verification process.
 */
function WaiverModal({
  axes,
  faceChecked,
  minorFaceChecked,
  identityChecked,
  onFaceCheckedChange,
  onMinorFaceCheckedChange,
  onIdentityCheckedChange,
  onConfirm,
  onCancel,
  saving,
}: {
  axes: AxisKey[];
  faceChecked: boolean;
  minorFaceChecked: boolean;
  identityChecked: boolean;
  onFaceCheckedChange: (v: boolean) => void;
  onMinorFaceCheckedChange: (v: boolean) => void;
  onIdentityCheckedChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const showFace = axes.includes("face");
  const showMinorFace = axes.includes("minor_face");
  const showIdentity = axes.includes("identity");
  const multi = axes.length > 1;

  const canConfirm =
    (showFace && faceChecked) ||
    (showMinorFace && minorFaceChecked) ||
    (showIdentity && identityChecked);

  const singleTitle = showFace
    ? "Publish adult faces unaltered — waiver"
    : showMinorFace
      ? "Publish minor faces unaltered — parental consent waiver"
      : "Use proper names in captions — waiver";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background p-5 shadow-lg">
        <h3 className="mb-2 text-sm font-semibold">
          {multi ? "Review your content safeguard waivers" : singleTitle}
        </h3>

        {multi && (
          <p className="mb-4 text-xs text-muted">
            You&apos;ve opted into permissive settings for more than one axis. Sign one, some,
            or all — unsigned axes fall back to the conservative behavior at publish time. You
            can revisit this page anytime to change.
          </p>
        )}

        <div className={multi ? "grid gap-4 md:grid-cols-2" : ""}>
          {showFace && (
            <WaiverSection
              title="Adult faces"
              checked={faceChecked}
              onCheckedChange={onFaceCheckedChange}
              checkboxLabel="I accept full responsibility for published adult face content."
            >
              <p>
                TracPost will publish images with detected adult faces appearing as-is, without
                blur or rectangle overlay. You are solely responsible for obtaining any
                necessary consent from adults whose faces appear in your published content.
              </p>
              <p>
                TracPost makes no claims about, and assumes no liability for, the consent status
                of any individual whose face appears in your uploaded images. By signing this
                waiver, you agree that any privacy claims, takedown requests, or legal disputes
                arising from published adult faces are your responsibility to resolve.
              </p>
            </WaiverSection>
          )}

          {showMinorFace && (
            <WaiverSection
              title="Minor faces — parental consent"
              accent="strong"
              checked={minorFaceChecked}
              onCheckedChange={onMinorFaceCheckedChange}
              checkboxLabel="I have verifiable parental or legal-guardian consent for every minor whose face will be published, and I accept full responsibility for that consent."
            >
              <p>
                TracPost will publish images with faces flagged as potentially under 18
                appearing as-is, without blur or rectangle overlay. This is a stronger
                commitment than the adult face waiver because parental consent is a higher
                legal bar than adult consent.
              </p>
              <p>
                You attest that you have a documented process for obtaining and verifying
                parental or legal-guardian consent before publishing minor faces, and that
                consent is on file for every minor whose face will appear in your content.
                TracPost makes no claims about, and assumes no liability for, the consent
                status of any minor whose face appears in your uploaded images.
              </p>
              <p>
                Any privacy claims, takedown requests, COPPA-adjacent inquiries, or legal
                disputes arising from published minor faces are your responsibility to
                resolve. TracPost can disable this option for your business at any time if a
                credible concern is raised.
              </p>
            </WaiverSection>
          )}

          {showIdentity && (
            <WaiverSection
              title="Names in captions"
              checked={identityChecked}
              onCheckedChange={onIdentityCheckedChange}
              checkboxLabel="I accept full responsibility for published name mentions."
            >
              <p>
                TracPost&apos;s caption generator will preserve proper names from your audio
                transcripts in published copy (e.g. &quot;Mary loved her new addition&quot;
                rather than &quot;our client loved her new addition&quot;).
              </p>
              <p>
                Your audio recordings and transcripts serve as the consent record — you
                mentioned these names in your own voice. TracPost retains your audio and
                transcripts as evidence that the name attribution originated with you. You are
                solely responsible for any privacy claims arising from published name mentions.
              </p>
            </WaiverSection>
          )}
        </div>

        <p className="mt-4 text-[10px] text-muted">
          You can revoke any signed waiver later by switching back to a conservative option on
          this page.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || saving}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Signing…" : "Sign and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaiverSection({
  title,
  checked,
  onCheckedChange,
  checkboxLabel,
  children,
  accent = "default",
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  checkboxLabel: string;
  children: React.ReactNode;
  accent?: "default" | "strong";
}) {
  const wrapperClass =
    accent === "strong"
      ? "rounded border border-accent/40 bg-accent/5 p-4"
      : "rounded border border-border bg-surface p-4";
  return (
    <div className={wrapperClass}>
      <h4 className="mb-2 text-xs font-semibold">{title}</h4>
      <div className="space-y-2 text-xs text-muted">{children}</div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 cursor-pointer accent-accent"
        />
        <span className="text-foreground">{checkboxLabel}</span>
      </label>
    </div>
  );
}
