import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { TeamGrid } from "./team-grid";
import { MobileSettings } from "./mobile-settings";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export default async function MobileAppPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Auto-seed owner team member on first visit
  const [existingOwner] = await sql`
    SELECT id FROM team_members
    WHERE subscriber_id = ${session.subscriberId} AND role = 'owner'
  `;

  if (!existingOwner) {
    const inviteToken = crypto.randomBytes(32).toString("base64url");
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    await sql`
      INSERT INTO team_members (subscriber_id, name, role, invite_token, invite_method, invite_expires)
      VALUES (
        ${session.subscriberId},
        ${session.subscriberName},
        'owner',
        ${inviteToken},
        'qr',
        ${inviteExpires}
      )
    `;
  }

  const [subRow, members, sites, settingsRow] = await Promise.all([
    sql`SELECT plan FROM subscribers WHERE id = ${session.subscriberId}`,
    sql`
      SELECT id, name, email, phone, role, site_id, invite_method,
             invite_token, invite_expires, invite_consumed,
             session_token_hash IS NOT NULL AS has_device,
             last_active_at, is_active, created_at
      FROM team_members
      WHERE subscriber_id = ${session.subscriberId}
      ORDER BY
        CASE role WHEN 'owner' THEN 0 WHEN 'engagement' THEN 1 WHEN 'capture' THEN 2 ELSE 3 END,
        created_at ASC
    `,
    sql`
      SELECT id, name FROM sites
      WHERE subscriber_id = ${session.subscriberId} AND deleted_at IS NULL
      ORDER BY created_at ASC
    `,
    session.activeSiteId
      ? sql`SELECT mobile_settings FROM sites WHERE id = ${session.activeSiteId}`
      : Promise.resolve([]),
  ]);

  const plan = (subRow[0]?.plan as string) || "free";
  const userLimit = plan === "pro" || plan === "authority" ? 5 : 1;
  const activeCount = members.filter((m) => m.is_active).length;

  const siteList = sites.map((s) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  const memberList = members.map((m) => ({
    id: m.id as string,
    name: m.name as string,
    email: (m.email as string) || null,
    phone: (m.phone as string) || null,
    role: m.role as string,
    siteId: (m.site_id as string) || null,
    inviteToken: (m.invite_token as string) || null,
    inviteExpires: m.invite_expires ? String(m.invite_expires) : null,
    inviteConsumed: m.invite_consumed as boolean,
    hasDevice: m.has_device as boolean,
    lastActiveAt: m.last_active_at ? String(m.last_active_at) : null,
    isActive: m.is_active as boolean,
  }));

  const defaults = {
    auto_handle_compliments: false,
    veto_window_hours: 4,
    notify_pipeline: true,
    notify_reviews: true,
    notify_comments: true,
    notify_veto: true,
    notify_blog: true,
    capture_default_pillar: null as string | null,
    capture_max_video_seconds: 60,
  };

  const settings = {
    ...defaults,
    ...((settingsRow[0]?.mobile_settings as Record<string, unknown>) || {}),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Mobile App</h1>
      <p className="mb-8 text-sm text-muted">
        Manage team access and app settings
      </p>

      <TeamGrid
        members={memberList}
        sites={siteList}
        userLimit={userLimit}
        activeCount={activeCount}
        plan={plan}
      />

      <MobileSettings initialSettings={settings} />
    </div>
  );
}
