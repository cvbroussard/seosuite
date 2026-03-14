import { EmptyState } from "@/components/empty-state";

export default function MediaPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
      <p className="mb-8 text-sm text-muted">
        Photos, videos & voice memos from mobile capture
      </p>

      <EmptyState
        icon="▣"
        title="No media assets yet"
        description="Capture photos, videos, or voice memos from the mobile app. Assets land here for AI processing and social post generation."
      />
    </div>
  );
}
