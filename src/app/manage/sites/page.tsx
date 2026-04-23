"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Site Controls" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Site controls for {siteId}</p></div>}</ManagePage>;
}
