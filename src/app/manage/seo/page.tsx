"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { SeoTab } from "@/app/admin/sites/[siteId]/tabs/seo";
export default function Page() {
  return (
    <ManagePage title="SEO" requireSite>
      {({ siteId }) => <div className="p-4"><SeoTab siteId={siteId} /></div>}
    </ManagePage>
  );
}
