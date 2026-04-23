"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Corrections" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Content corrections for site {siteId}</p></div>}</ManagePage>;
}
