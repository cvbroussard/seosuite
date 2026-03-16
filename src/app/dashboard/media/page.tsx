import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  received: "bg-muted/20 text-muted",
  triaged: "bg-accent/20 text-accent",
  scheduled: "bg-success/20 text-success",
  consumed: "bg-success/20 text-success",
  shelved: "bg-warning/20 text-warning",
  flagged: "bg-danger/20 text-danger",
  rejected: "bg-danger/20 text-danger",
};

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

  const assets = await sql`
    SELECT id, storage_url, media_type, context_note, triage_status,
           quality_score, content_pillar, platform_fit, flag_reason,
           shelve_reason, created_at
    FROM media_assets
    WHERE site_id = ${siteId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
          <p className="text-sm text-muted">{assets.length} asset{assets.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((a) => (
            <div
              key={a.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-accent/40"
            >
              {/* Thumbnail */}
              <div className="relative aspect-square bg-background">
                {a.media_type === "image" ? (
                  <img
                    src={a.storage_url}
                    alt={a.context_note || ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-muted">
                    ▶
                  </div>
                )}

                {/* Status badge */}
                <span
                  className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    statusColors[a.triage_status] || "bg-muted/20 text-muted"
                  }`}
                >
                  {a.triage_status}
                </span>

                {/* Video indicator */}
                {a.media_type === "video" && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    video
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="px-2.5 py-2">
                {a.context_note ? (
                  <p className="truncate text-xs">{a.context_note}</p>
                ) : (
                  <p className="truncate text-xs text-muted">No caption</p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {a.content_pillar && (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px]">
                      {a.content_pillar}
                    </span>
                  )}
                  {a.quality_score && (
                    <span className="text-[10px] text-muted">
                      {(a.quality_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {a.flag_reason && (
                  <p className="mt-1 text-[10px] text-danger">{a.flag_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
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
