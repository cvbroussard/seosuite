"use client";

import { useState } from "react";

export function SubscriptionName({
  subscriptionId,
  initialName,
}: {
  subscriptionId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function save() {
    if (!name.trim() || name === initialName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionName: name.trim() }),
      });
      if (res.ok) {
        setSuccess(true);
        await fetch("/api/auth/refresh-session", { method: "POST" });
        setTimeout(() => setSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-border py-2">
      <span className="text-sm text-muted">Business name</span>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="px-2 py-1 text-right"
          style={{ width: 200 }}
        />
        <button
          onClick={save}
          disabled={saving || !name.trim() || name === initialName}
          className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
        >
          {saving ? "..." : success ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
