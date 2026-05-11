import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { AUTO_TAG_RULES, type TagGroup } from "@/lib/auto-tag-rules";

const TAG_GROUPS: TagGroup[] = ["brand", "service", "project", "persona", "branch", "service_area"];

/**
 * GET /api/tagging/config?site_id=...
 * Returns tag group labels + per-group keyword cue config (with defaults
 * merged in for groups the subscriber hasn't overridden). Single round
 * trip for the /dashboard/tagging Configure section.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT brand_label, project_label, persona_label, branch_label, service_area_label, service_label, tag_group_config
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const config = (site.tag_group_config || {}) as Partial<Record<TagGroup, { keyword_cues?: string[] }>>;
  // Subscriber sees the FULL effective vocabulary per group, plus the
  // hard-coded defaults for reference. If they edit, their list REPLACES
  // the default — they fully control the vocabulary.
  const keyword_cues: Record<TagGroup, { default: string[]; override: string[] | null; effective: string[] }> = {
    brand: { default: [], override: null, effective: [] },
    service: { default: [], override: null, effective: [] },
    project: { default: [], override: null, effective: [] },
    persona: { default: [], override: null, effective: [] },
    branch: { default: [], override: null, effective: [] },
    service_area: { default: [], override: null, effective: [] },
  };
  for (const g of TAG_GROUPS) {
    const def = AUTO_TAG_RULES[g].keyword_cues;
    const override = config[g]?.keyword_cues || null;
    keyword_cues[g] = {
      default: def,
      override,
      effective: (override && override.length > 0) ? override : def,
    };
  }

  return NextResponse.json({
    labels: {
      brand_label: site.brand_label as string | null,
      project_label: site.project_label as string | null,
      persona_label: site.persona_label as string | null,
      branch_label: site.branch_label as string | null,
      service_area_label: site.service_area_label as string | null,
      service_label: site.service_label as string | null,
    },
    keyword_cues,
  });
}

/**
 * PATCH /api/tagging/config
 * Body: {
 *   site_id,
 *   brand_label?, project_label?, persona_label?, branch_label?,
 *   service_area_label?, service_label?,
 *   keyword_cues?: { brand?: string[], service?: string[], ... }
 *     — REPLACES the default per group when non-empty array provided.
 *       Pass empty array or null to RESET to defaults. Pass undefined
 *       (omit the group key) to leave unchanged.
 * }
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { site_id, brand_label, project_label, persona_label, branch_label, service_area_label, service_label, keyword_cues } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify ownership + load existing config (PATCH semantics for cues)
  const [site] = await sql`
    SELECT id, tag_group_config FROM sites WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Per-group merge into existing tag_group_config (don't whole-replace).
  // Allows partial updates — subscriber editing one group's cues doesn't
  // wipe the others.
  let nextConfig = (site.tag_group_config || {}) as Record<string, { keyword_cues?: string[] }>;
  if (keyword_cues && typeof keyword_cues === "object") {
    nextConfig = { ...nextConfig };
    for (const g of TAG_GROUPS) {
      if (g in keyword_cues) {
        const val = (keyword_cues as Record<string, string[] | null>)[g];
        if (Array.isArray(val) && val.length > 0) {
          // Sanitize: lowercase, trim, dedupe, drop empties, cap at 20 entries
          const sanitized = Array.from(new Set(
            val.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
          )).slice(0, 20);
          nextConfig[g] = { ...nextConfig[g], keyword_cues: sanitized };
        } else {
          // null OR empty array → drop override (fall back to defaults)
          if (nextConfig[g]) {
            const { keyword_cues: _drop, ...rest } = nextConfig[g];
            void _drop;
            if (Object.keys(rest).length === 0) {
              delete nextConfig[g];
            } else {
              nextConfig[g] = rest;
            }
          }
        }
      }
    }
  }

  await sql`
    UPDATE sites
    SET brand_label = ${brand_label ?? null},
        project_label = ${project_label ?? null},
        persona_label = ${persona_label ?? null},
        branch_label = ${branch_label ?? null},
        service_area_label = ${service_area_label ?? null},
        service_label = ${service_label ?? null},
        tag_group_config = ${JSON.stringify(nextConfig)}::jsonb
    WHERE id = ${site_id}
  `;

  return NextResponse.json({ success: true });
}
