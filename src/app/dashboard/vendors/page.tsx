import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { VendorList } from "./vendor-list";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const vendors = await sql`
    SELECT id, name, slug, url, created_at
    FROM vendors
    WHERE subscriber_id = ${session.subscriberId}
    ORDER BY name ASC
  `;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Vendors</h1>
      <p className="mb-8 text-sm text-muted">
        Manage your vendor and partner directory. Tag vendors on media assets to auto-link their websites in blog posts.
      </p>
      <VendorList initialVendors={vendors as Array<{ id: string; name: string; slug: string; url: string | null; created_at: string }>} />
    </div>
  );
}
