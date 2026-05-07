import { sql } from "@/lib/db";
import type { Strategy } from "../types";
import type { ContentSpec } from "../../types";

/**
 * Project-chapter strategy.
 *
 * "Project X is at midpoint; generate the process article."
 *
 * Looks at active projects and produces a chapter-shaped article aligned
 * to the project's lifecycle phase:
 *   - beginning: introduction, scope, before-state, why we took it on
 *   - process:   decisions, materials, trades, in-flight problem-solving
 *   - finished:  reveal, before/after, outcomes, lessons
 *
 * Builds a blog article (not a project page — the project itself is the
 * anchor; this article is content ABOUT the project that links to it).
 *
 * Stub today — gains real value once projects_v2 has active rows with
 * lifecycle dates. Returns null when no active projects exist.
 */
export const projectChapterStrategy: Strategy = {
  kind: "project_chapter",
  label: "Project-chapter (lifecycle-aware)",

  score(assessment) {
    if (assessment.activeProjects.length === 0) return 0;
    // Strong score when projects are at meaningful milestones (beginning
    // or finished); softer for ongoing process.
    const meaningful = assessment.activeProjects.filter(
      (p) => p.phase === "beginning" || p.phase === "finished",
    );
    if (meaningful.length > 0) return 0.75;
    return 0.4; // process-phase articles are still valuable, just less timely
  },

  async build(assessment): Promise<ContentSpec | null> {
    if (assessment.activeProjects.length === 0) return null;

    // Prefer beginning/finished phases over process.
    const ranked = [...assessment.activeProjects].sort((a, b) => {
      const order = { beginning: 0, finished: 1, process: 2 };
      return order[a.phase] - order[b.phase];
    });
    const project = ranked[0];

    // Pull the project's hero + assets to seed the article.
    const [projectRow] = await sql`
      SELECT name, slug, description, hero_asset_id, content_pillars
      FROM projects_v2
      WHERE id = ${project.id} AND site_id = ${assessment.siteId}
    `;
    if (!projectRow) return null;

    // Project assets become candidate body images.
    const manifestRows = await sql`
      SELECT media_asset_id FROM project_assets
      WHERE project_id = ${project.id}
      ORDER BY slot_index
    `;
    const bodyAssetIds = manifestRows
      .map((r) => r.media_asset_id as string)
      .filter((id) => id !== projectRow.hero_asset_id);

    const intent = project.phase === "beginning"
      ? "Introduce the project: scope, before-state, why we took it on"
      : project.phase === "finished"
      ? "Tell the finished story: reveal, before/after, outcomes, lessons"
      : "Process article: decisions, materials, trades, in-flight problem-solving";

    return {
      pool: "blog",
      siteId: assessment.siteId,
      topicHint: `Project chapter (${project.phase}): ${project.name}`,
      intent,
      heroAssetId: projectRow.hero_asset_id as string,
      bodyAssetIds,
      contentPillars: Array.isArray(projectRow.content_pillars)
        ? (projectRow.content_pillars as string[])
        : [],
      status: "draft",
    };
  },
};
