import { EmptyState } from "@/components/empty-state";

export default function SocialPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Social</h1>
      <p className="mb-8 text-sm text-muted">
        Connected accounts, posts & analytics
      </p>

      <div className="mb-6 flex gap-4 border-b border-border pb-4">
        <span className="text-sm font-medium text-accent">Accounts</span>
        <span className="text-sm text-muted">Posts</span>
        <span className="text-sm text-muted">Analytics</span>
        <span className="text-sm text-muted">Triggers</span>
      </div>

      <EmptyState
        icon="◉"
        title="No social accounts connected"
        description="Connect Instagram, YouTube, or other platforms to start managing social content from here."
      />
    </div>
  );
}
