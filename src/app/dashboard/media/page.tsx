import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first to start uploading media.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [assets, siteData] = await Promise.all([
    sql`
      SELECT id, storage_url, media_type, context_note, triage_status,
             quality_score, content_pillar, content_pillars, platform_fit, flag_reason,
             shelve_reason, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    sql`SELECT content_pillars FROM sites WHERE id = ${siteId}`,
  ]);

  const pillars = (siteData[0]?.content_pillars || []) as string[];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
          <p className="text-sm text-muted">
            {assets.length} asset{assets.length !== 1 ? "s" : ""} &middot; Click to edit
          </p>
        </div>
      </div>

      {assets.length > 0 ? (
        <MediaGrid initialAssets={assets as Parameters<typeof MediaGrid>[0]["initialAssets"]} availablePillars={pillars} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <span className="mb-3 text-3xl">▣</span>
          <h3 className="mb-1 text-sm font-medium">No media uploaded</h3>
          <p className="max-w-xs text-xs text-muted">
            Upload photos and videos from the Capture page to start building your content library.
          </p>
        </div>
      )}
    </div>
  );
}
