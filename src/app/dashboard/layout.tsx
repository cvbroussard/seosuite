import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TopBar } from "@/components/topbar";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch linked channels for the active site
  const activeSiteId = session.activeSiteId || session.sites[0]?.id;
  let channels: Array<{ id: string; platform: string; account_name: string }> = [];

  if (activeSiteId) {
    channels = (await sql`
      SELECT sa.id, sa.platform, sa.account_name
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${activeSiteId} AND sa.status = 'active'
      ORDER BY sa.platform ASC
    `) as Array<{ id: string; platform: string; account_name: string }>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="hidden md:block">
        <TopBar subscriberName={session.subscriberName} />
      </div>
      <MobileNav subscriberName={session.subscriberName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            sites={session.sites}
            activeSiteId={activeSiteId}
            channels={channels}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
