"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { CorrectionsPanel } from "@/app/admin/sites/[siteId]/website-pane";
export default function Page() {
  return (
    <ManagePage title="Content Corrections" requireSite>
      {({ siteId }) => (
        <div className="p-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Content Corrections</h3>
            <p className="text-[10px] text-muted mb-3">Tenant-requested adjustments injected into all future generation prompts.</p>
            <CorrectionsPanel siteId={siteId} />
          </div>
        </div>
      )}
    </ManagePage>
  );
}
