"use client";

import { useState, useRef } from "react";

export default function CapturePage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [staffNote, setStaffNote] = useState("");
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleCapture(file: File) {
    setUploading(true);
    setError("");

    try {
      // Get presigned URL
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: "active",
          content_type: file.type,
          filename: file.name,
        }),
      });

      if (!presignRes.ok) {
        setError("Failed to get upload URL");
        setUploading(false);
        return;
      }

      const { upload_url, public_url, key } = await presignRes.json();

      // Upload to R2
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      setPhotoUrl(public_url);

      // Create Spotlight session
      const sessionRes = await fetch("/api/spotlight/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: "active",
          photo_url: public_url,
          photo_key: key,
          staff_note: staffNote || null,
        }),
      });

      if (sessionRes.ok) {
        const data = await sessionRes.json();
        setSessionCode(data.session.session_code);
      } else {
        setError("Failed to create Spotlight session");
      }
    } catch {
      setError("Upload failed");
    }
    setUploading(false);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1>Start Spotlight</h1>
      <p className="mt-1 mb-6 text-muted">Capture a customer moment.</p>

      {!sessionCode ? (
        <>
          {/* Staff note */}
          <input
            type="text"
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder="Context (e.g., Jake bought a Les Paul)"
            className="mb-4 w-full rounded border border-border bg-background p-3 text-sm focus:border-accent focus:outline-none"
          />

          {/* Photo preview */}
          {photoUrl && (
            <div className="mb-4">
              <img src={photoUrl} alt="Capture" className="w-full rounded-xl" />
            </div>
          )}

          {/* Capture button */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCapture(file);
            }}
          />

          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl bg-accent py-4 text-lg font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Take Photo"}
          </button>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </>
      ) : (
        /* Session created */
        <div className="text-center">
          <div className="mb-4">
            <img src={photoUrl!} alt="Captured" className="mx-auto w-48 rounded-xl" />
          </div>
          <p className="text-sm text-muted">Photo sent to kiosk!</p>
          <p className="mt-2 text-4xl font-mono font-bold tracking-widest">{sessionCode}</p>
          <p className="mt-2 text-xs text-muted">Session code (for reference)</p>

          <button
            onClick={() => {
              setSessionCode(null);
              setPhotoUrl(null);
              setStaffNote("");
            }}
            className="mt-8 rounded border border-border px-6 py-2 text-sm text-muted hover:text-foreground"
          >
            New Spotlight
          </button>
        </div>
      )}
    </div>
  );
}
