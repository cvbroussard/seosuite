"use client";

import { useState, useEffect } from "react";

interface OnboardingTipProps {
  /** Unique key for this tip (persisted in localStorage) */
  tipKey: string;
  /** The educational message */
  message: string;
  /** Whether the related checklist item is incomplete (auto-show) */
  incomplete: boolean;
}

export function OnboardingTip({ tipKey, message, incomplete }: OnboardingTipProps) {
  const storageKey = `tp-tip-${tipKey}`;
  const [visible, setVisible] = useState(false);
  const [manualToggle, setManualToggle] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey) === "dismissed";
    if (incomplete && !dismissed) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [incomplete, storageKey]);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(storageKey, "dismissed");
  }

  function toggle() {
    if (visible) {
      dismiss();
    } else {
      setVisible(true);
      setManualToggle(true);
      localStorage.removeItem(storageKey);
    }
  }

  return (
    <>
      {/* Tip banner */}
      {visible && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            marginBottom: 24,
            borderRadius: "var(--tp-radius)",
            background: "var(--color-accent-muted)",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--color-foreground)",
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 1 }}>💡</span>
          <span style={{ flex: 1 }}>{message}</span>
          <button
            onClick={dismiss}
            style={{
              flexShrink: 0,
              color: "var(--color-muted)",
              fontSize: 13,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Recall button — always visible, subtle */}
      {!visible && (
        <button
          onClick={toggle}
          title="Show tip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid var(--color-border)",
            background: "none",
            color: "var(--color-muted)",
            fontSize: 12,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          ?
        </button>
      )}
    </>
  );
}
