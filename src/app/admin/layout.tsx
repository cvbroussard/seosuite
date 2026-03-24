import { TopBar } from "@/components/topbar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminAlerts } from "./admin-alerts";

export const metadata = {
  title: "TracPost — Admin",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar subscriberName="Admin" variant="platform" />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
        <AdminAlerts />
      </div>
    </div>
  );
}
