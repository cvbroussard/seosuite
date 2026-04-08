import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/projects/:id/generate-article
 *
 * Generate a blog article about this project.
 * Body: { promptIndex?: number } — if provided, uses that article prompt.
 *        Otherwise generates a general chronological article.
 *
 * GET /api/projects/:id/generate-article
 * Returns the list of article prompts (angles) for this project.
 * Generates them if they don't exist yet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [project] = await sql`
    SELECT p.id, p.metadata FROM projects p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const meta = (project.metadata || {}) as Record<string, unknown>;
  let prompts = meta.article_prompts as Array<{ title: string; angle: string; assetHint: string }> | undefined;

  // Generate prompts if not yet created
  if (!prompts || prompts.length === 0) {
    const { generateArticlePrompts } = await import("@/lib/pipeline/project-blog-generator");
    prompts = await generateArticlePrompts(id);
  }

  return NextResponse.json({ prompts: prompts || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [project] = await sql`
    SELECT p.id, p.site_id, p.metadata FROM projects p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const promptIndex = body.promptIndex as number | undefined;

  try {
    let article;

    if (promptIndex !== undefined) {
      // Generate from a specific angle
      const meta = (project.metadata || {}) as Record<string, unknown>;
      const prompts = meta.article_prompts as Array<{ title: string; angle: string; assetHint: string }> | undefined;
      const articlePrompt = prompts?.[promptIndex];

      if (!articlePrompt) {
        return NextResponse.json({ error: "Article prompt not found at that index" }, { status: 400 });
      }

      const { generateProjectArticleFromPrompt } = await import("@/lib/pipeline/project-blog-generator");
      article = await generateProjectArticleFromPrompt(id, project.site_id as string, articlePrompt);
    } else {
      // Generate general chronological article
      const { generateProjectArticle } = await import("@/lib/pipeline/project-blog-generator");
      article = await generateProjectArticle(id, project.site_id as string);
    }

    if (!article) {
      return NextResponse.json(
        { error: "Article generation failed — ensure the project has at least 3 captioned assets" },
        { status: 400 }
      );
    }

    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    const [post] = await sql`
      INSERT INTO blog_posts (site_id, title, slug, body, excerpt, status, source_asset_id, metadata)
      VALUES (
        ${project.site_id},
        ${article.title},
        ${slug},
        ${article.body},
        ${article.excerpt},
        'draft',
        ${article.featuredAssetId || null},
        ${JSON.stringify({
          type: "project",
          project_id: id,
          asset_ids: article.assets.map((a) => a.id),
          prompt_index: promptIndex ?? null,
        })}
      )
      RETURNING id, title, slug, status
    `;

    return NextResponse.json({ post, article: { title: article.title, excerpt: article.excerpt } });
  } catch (err) {
    console.error("Project article generation error:", err instanceof Error ? err.stack || err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Article generation failed" },
      { status: 500 }
    );
  }
}
