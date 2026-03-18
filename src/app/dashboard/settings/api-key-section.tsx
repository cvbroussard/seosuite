"use client";

import { useState } from "react";

export function ApiKeySection() {
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleRegenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/api-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setConfirming(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1">API Key</h2>
      <p className="mb-4 text-sm text-muted">
        For programmatic API access. Keep this secret — it grants full access to your account.
      </p>

      {newKey ? (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-danger">
            New API key (copy now — shown only once)
          </label>
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-danger/10 px-3 py-2.5 font-mono text-sm break-all">
              {newKey}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-sm text-muted hover:text-foreground"
          >
            Done
          </button>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-danger">This will invalidate your current key. Continue?</span>
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="border border-danger/30 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {loading ? "..." : "Yes, regenerate"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          Regenerate API Key
        </button>
      )}
    </section>
  );
}
