"use client";

import { useState } from "react";

/**
 * Two-axis privacy settings panel.
 *
 * Faces (likeness) and Identity (names) are independent. Each axis has
 * a conservative default that needs no waiver, and a permissive option
 * that requires the subscriber to sign an explicit waiver. Once signed,
 * the waiver record persists for audit even if subscriber reverts to
 * the conservative option later.
 *
 * UI: two cards, each with policy radios + waiver state + sign/revoke
 * affordance. Permissive options open a waiver modal before applying.
 */

interface AxisState {
  policy: string;
  waiver_signed_at: string | null;
  waiver_version: string | null;
}

interface Props {
  siteId: string;
  initial: { face: AxisState; identity: AxisState };
}

const FACE_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "blur",
    label: "Blur faces (default)",
    description:
      "Every detected face is gaussian-blurred at publish time. Safe by default — no consent or waiver concerns. Works for any business publishing photos with people in them.",
    requiresWaiver: false,
  },
  {
    value: "box",
    label: "Rectangle overlay",
    description:
      "Each detected face is covered by a solid rectangle. Editorial / stylistic choice that preserves anonymity while showing people are present.",
    requiresWaiver: false,
  },
  {
    value: "suppress",
    label: "Don't publish images with faces",
    description:
      "Assets with detected faces are quarantined from autopilot publishing. Most conservative; you'd manually compose for the rare face-OK shot.",
    requiresWaiver: false,
  },
  {
    value: "asis",
    label: "Publish faces unaltered",
    description:
      "Faces appear as-is in published images. Opt into this if you have consent from the people in your uploads (crew, clients who agreed to be featured, public-figure context). Because TracPost's autopilot is the publisher-of-record, you sign a one-time waiver accepting responsibility for the consent status of every person whose face appears in your published content.",
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

/** Returns true if the axis is on the permissive option (requires
 * waiver) but no waiver is signed. This is the "needs attention" state
 * that triggers the first-visit modal and the inline warnings. */
function needsSigning(axis: AxisState, options: typeof FACE_OPTIONS): boolean {
  const opt = options.find((o) => o.value === axis.policy);
  return Boolean(opt?.requiresWaiver) && !axis.waiver_signed_at;
}

export function PrivacyPanel({ siteId, initial }: Props) {
  const [face, setFace] = useState<AxisState>(initial.face);
  const [identity, setIdentity] = useState<AxisState>(initial.identity);
  // Modal axes: empty array = no modal open. Otherwise the array names
  // which sections appear inside the unified modal (one or two).
  const [modalAxes, setModalAxes] = useState<Array<"face" | "identity">>([]);
  const [faceChecked, setFaceChecked] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePolicy(opts: {
    face_policy?: string;
    identity_policy?: string;
    sign_face_waiver?: boolean;
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
      // Open the unified modal targeting just the face axis. Pre-fill
      // the pending policy via the face state so the modal's sign
      // action knows to save it together with the waiver.
      setFace({ ...face, policy: nextValue });
      setModalAxes(["face"]);
      setFaceChecked(false);
      return;
    }
    void savePolicy({ face_policy: nextValue });
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
    if (modalAxes.includes("identity") && identityChecked) {
      opts.identity_policy = identity.policy;
      opts.sign_identity_waiver = true;
    }
    if (Object.keys(opts).length === 0) return;
    await savePolicy(opts);
    setModalAxes([]);
    setFaceChecked(false);
    setIdentityChecked(false);
  }

  function dismissModal() {
    setModalAxes([]);
    setFaceChecked(false);
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
        title="Faces in images"
        currentPolicy={face.policy}
        options={FACE_OPTIONS}
        waiverSignedAt={face.waiver_signed_at}
        waiverVersion={face.waiver_version}
        onChange={handleFaceChange}
        disabled={saving}
        needsSigning={needsSigning(face, FACE_OPTIONS)}
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
          identityChecked={identityChecked}
          onFaceCheckedChange={setFaceChecked}
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
  currentPolicy,
  options,
  waiverSignedAt,
  waiverVersion,
  onChange,
  disabled,
  needsSigning,
}: {
  title: string;
  currentPolicy: string;
  options: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }>;
  waiverSignedAt: string | null;
  waiverVersion: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
  needsSigning: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
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
 * Unified waiver modal — handles 1 or 2 axes in a single ceremony.
 *
 * Three trigger paths land here:
 *   1. First-visit (page mount): both axes need signing → axes=['face','identity']
 *   2. Single-axis change (subscriber picks asis/allow_names): axes=['face'] or ['identity']
 *   3. Either case after one has already been signed: only the unsigned axis appears
 *
 * Each section is independently signable. Subscriber can sign one, both,
 * or neither (dismissing without signing is allowed — they can come back).
 * The "Sign & continue" button only commits the axes whose checkboxes
 * are checked.
 */
function WaiverModal({
  axes,
  faceChecked,
  identityChecked,
  onFaceCheckedChange,
  onIdentityCheckedChange,
  onConfirm,
  onCancel,
  saving,
}: {
  axes: Array<"face" | "identity">;
  faceChecked: boolean;
  identityChecked: boolean;
  onFaceCheckedChange: (v: boolean) => void;
  onIdentityCheckedChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const showFace = axes.includes("face");
  const showIdentity = axes.includes("identity");
  const isInitial = axes.length === 2;

  // Confirm button enabled when at least one axis is checked
  const canConfirm = (showFace && faceChecked) || (showIdentity && identityChecked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background p-5 shadow-lg">
        <h3 className="mb-2 text-sm font-semibold">
          {isInitial
            ? "Welcome — review your privacy waivers"
            : showFace
              ? "Publish faces unaltered — waiver"
              : "Use proper names in captions — waiver"}
        </h3>

        {isInitial && (
          <p className="mb-4 text-xs text-muted">
            Your current settings opt into the permissive defaults for both axes. To enact those
            choices, TracPost needs your acknowledgment as publisher-of-record. Sign one, both,
            or neither — unsigned axes fall back to the conservative behavior at publish time.
            You can revisit this page anytime to change.
          </p>
        )}

        <div className={isInitial ? "grid gap-4 md:grid-cols-2" : ""}>
          {showFace && (
            <WaiverSection
              title="Faces in images"
              checked={faceChecked}
              onCheckedChange={onFaceCheckedChange}
              checkboxLabel="I accept full responsibility for published face content."
            >
              <p>
                TracPost will publish images with detected faces appearing as-is, without blur or
                rectangle overlay. You are solely responsible for obtaining any necessary consent
                from people whose faces appear in your published content.
              </p>
              <p>
                TracPost makes no claims about, and assumes no liability for, the consent status
                of any individual whose face appears in your uploaded images. By signing this
                waiver, you agree that any privacy claims, takedown requests, or legal disputes
                arising from published faces are your responsibility to resolve.
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
            {isInitial ? "Skip for now" : "Cancel"}
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
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  checkboxLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
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
