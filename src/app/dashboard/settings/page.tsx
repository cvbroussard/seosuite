export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-8 text-sm text-muted">
        Site configuration & API keys
      </p>

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">Site Info</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Site Name</label>
              <div className="rounded border border-border bg-background px-3 py-2 text-sm text-muted">
                —
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Site URL</label>
              <div className="rounded border border-border bg-background px-3 py-2 text-sm text-muted">
                —
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">Brand Voice</h2>
          <p className="text-xs text-muted">
            Configure tone, style guidelines, and content preferences for AI-generated captions and meta descriptions.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">API Access</h2>
          <p className="text-xs text-muted">
            API key management for programmatic access.
          </p>
        </section>
      </div>
    </div>
  );
}
