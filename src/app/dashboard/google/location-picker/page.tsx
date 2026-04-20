import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LocationPickerClient } from "./location-picker-client";

export const dynamic = "force-dynamic";

export default async function LocationPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription_id?: string; source?: string; initiating_site_id?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const subscriptionId = params.subscription_id || session.subscriptionId;

  // Get all unlinked GBP social accounts for this subscription
  const gbpAccounts = await sql`
    SELECT sa.id, sa.account_name, sa.account_id,
           sa.metadata->>'location_name' AS location_name,
           sa.metadata->>'address' AS address,
           sa.metadata->>'account_id' AS gbp_account_id
    FROM social_accounts sa
    WHERE sa.subscription_id = ${subscriptionId}
      AND sa.platform = 'gbp'
      AND sa.status = 'active'
    ORDER BY sa.account_name
  `;

  // Get all sites for this subscription
  const sites = await sql`
    SELECT id, name FROM sites
    WHERE subscription_id = ${subscriptionId} AND is_active = true
    ORDER BY name
  `;

  // Get existing site_social_links to show current assignments
  const existingLinks = await sql`
    SELECT ssl.site_id, ssl.social_account_id, s.name AS site_name
    FROM site_social_links ssl
    JOIN sites s ON s.id = ssl.site_id
    JOIN social_accounts sa ON sa.id = ssl.social_account_id
    WHERE sa.platform = 'gbp' AND sa.subscription_id = ${subscriptionId}
  `;

  const linkMap: Record<string, string> = {};
  for (const link of existingLinks) {
    linkMap[link.social_account_id as string] = link.site_id as string;
  }

  return (
    <LocationPickerClient
      locations={gbpAccounts.map((a) => ({
        socialAccountId: a.id as string,
        name: (a.location_name || a.account_name) as string,
        address: a.address as string | null,
        currentSiteId: linkMap[a.id as string] || null,
      }))}
      sites={sites.map((s) => ({
        id: s.id as string,
        name: s.name as string,
      }))}
      source={params.source || "dashboard"}
      initiatingSiteId={params.initiating_site_id || null}
    />
  );
}
