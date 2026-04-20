import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function GoogleProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <ProfileClient siteId={session.activeSiteId} />;
}
