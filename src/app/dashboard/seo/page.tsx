import { EmptyState } from "@/components/empty-state";

export default function SeoPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">SEO</h1>
      <p className="mb-8 text-sm text-muted">
        Page audits, meta content & optimization scores
      </p>

      <div className="mb-6 flex gap-4 border-b border-border pb-4">
        <span className="text-sm font-medium text-accent">Audits</span>
        <span className="text-sm text-muted">Meta Content</span>
      </div>

      <EmptyState
        icon="◈"
        title="No SEO audits yet"
        description="Run your first page audit to see optimization scores, meta content suggestions, and structured data validation."
      />
    </div>
  );
}
