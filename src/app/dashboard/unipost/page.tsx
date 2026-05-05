import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy alias — /dashboard/unipost has been renamed to /dashboard/unifeed
 * (Phase 3 of the publish-module refactor, task #82). This route remains
 * as a redirect so existing bookmarks/links continue working.
 *
 * Remove once telemetry shows no traffic hits this route for a few weeks.
 */
export default function UnipostLegacyRedirect() {
  redirect("/dashboard/unifeed");
}
