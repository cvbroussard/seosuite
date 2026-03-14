import { EmptyState } from "@/components/empty-state";

export default function GbpPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Google Business Profile</h1>
      <p className="mb-8 text-sm text-muted">
        Locations, credentials & sync status
      </p>

      <div className="mb-6 flex gap-4 border-b border-border pb-4">
        <span className="text-sm font-medium text-accent">Locations</span>
        <span className="text-sm text-muted">Credentials</span>
      </div>

      <EmptyState
        icon="◎"
        title="No GBP locations linked"
        description="Connect your Google Business Profile to sync location data, manage posts, and track local search performance."
      />
    </div>
  );
}
