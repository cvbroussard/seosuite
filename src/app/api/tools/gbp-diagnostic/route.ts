import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/tools/gbp-diagnostic
 *
 * Public (no auth). Takes a business type + optional location, runs
 * a keyword match against the GBP category index, then LLM-reranks
 * the top candidates with per-category reasoning.
 *
 * Rate-limited by Vercel's edge (no custom rate-limit today —
 * acceptable for a free tool at launch scale).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessType = String(body.businessType || "").trim();
  const location = body.location ? String(body.location).trim() : null;

  if (!businessType || businessType.length < 3) {
    return NextResponse.json({ error: "Please describe your business." }, { status: 400 });
  }

  // Keyword-match against gbp_categories
  const signalText = `${businessType} ${location || ""}`.toLowerCase();
  const tokens = new Set(
    signalText.split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );

  if (tokens.size === 0) {
    return NextResponse.json({ error: "Could not extract search terms." }, { status: 400 });
  }

  const rows = await sql`SELECT gcid, name, keywords FROM gbp_categories`;
  const scored = rows.map((r) => {
    const name = String(r.name).toLowerCase();
    const keywords: string[] = (r.keywords as string[]) || [];
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += 2;
      for (const k of keywords) {
        if (k.toLowerCase() === t) score += 3;
        else if (k.toLowerCase().includes(t) || t.includes(k.toLowerCase())) score += 1;
      }
    }
    return { gcid: String(r.gcid), name: String(r.name), keywords, score };
  });

  const candidates = scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  if (candidates.length === 0) {
    return NextResponse.json({
      error: "No matching categories found. Try a broader description.",
    }, { status: 400 });
  }

  // LLM rerank
  const candidateList = candidates
    .map((c) => `- ${c.name} (keywords: ${c.keywords.join(", ")})`)
    .join("\n");

  const prompt = `You are classifying a local business for Google Business Profile. Pick the single BEST primary category and up to 4 additional categories from the candidates below.

Business: ${businessType}
Location: ${location || "(not specified)"}

Candidates:
${candidateList}

Reply with ONLY a JSON array:
[
  { "name": "Category Name", "reasoning": "One sentence why this fits", "isPrimary": true },
  { "name": "Category Name", "reasoning": "One sentence why", "isPrimary": false }
]

Rules:
- Exactly 1 entry with isPrimary=true (the narrowest match)
- 0-4 entries with isPrimary=false (meaningful secondary lines only)
- Use exact category names from the list
- Reasoning must reference the business description specifically`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: "Analysis failed. Try again." }, { status: 500 });
    }

    const categories = JSON.parse(match[0]) as Array<{
      name: string;
      reasoning: string;
      isPrimary: boolean;
    }>;

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "Analysis failed. Try again." }, { status: 500 });
  }
}
