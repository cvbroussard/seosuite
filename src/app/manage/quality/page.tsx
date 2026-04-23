"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Quality Gates" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Quality gates for site {siteId}</p></div>}</ManagePage>;
}
