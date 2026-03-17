import { redirect } from "next/navigation";
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="hidden md:block">
        <TopBar subscriberName={session.subscriberName} />
      </div>
      <MobileNav subscriberName={session.subscriberName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
