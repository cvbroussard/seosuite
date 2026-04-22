import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SearchClient } from "./search-client";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <SearchClient siteId={session.activeSiteId} />;
}
