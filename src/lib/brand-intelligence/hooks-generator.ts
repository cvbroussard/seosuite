import Anthropic from "@anthropic-ai/sdk";
import type {
  AudienceResearch,
  BrandAngle,
  ContentHook,
  HookCategory,
} from "./types";

const anthropic = new Anthropic();

/**
 * Generate 50 scroll-stopping hooks based on audience research
 * and selected brand angles. Subscriber rates these (loved/liked/skip)
 * to build their curated hook bank.
 */
export async function generateHooks(
  research: AudienceResearch,
  selectedAngles: BrandAngle[]
): Promise<ContentHook[]> {
  const angleContext = selectedAngles
    .map((a) => `"${a.name}" — ${a.tagline} (tone: ${a.tone})`)
    .join("\n");

  const painContext = research.painPoints
    .map((p) => `- ${p.pain} (${p.severity}): "${p.realQuotes[0]}"`)
    .join("\n");

  const languageContext = [
    `Pain phrases: ${research.languageMap.painPhrases.join(", ")}`,
    `Desire phrases: ${research.languageMap.desirePhrases.join(", ")}`,
    `Emotional triggers: ${research.languageMap.emotionalTriggers.join(", ")}`,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are an expert short-form content strategist. Generate 50 scroll-stopping hooks for social media content.

## Brand Angles
${angleContext}

## Audience Pain Points
${painContext}

## Audience Language
${languageContext}

## Transformation
From: ${research.transformationJourney.currentState.slice(0, 200)}
To: ${research.transformationJourney.desiredState.slice(0, 200)}

## Failed Solutions
${research.urgencyGateway.failedSolutions.join("\n")}

## Instructions

Generate exactly 50 hooks. Each hook is a single sentence (6-20 words) designed to stop the scroll on social media. They should feel like the opening line of a reel, a blog headline, or a caption opener.

Distribute across these categories:
- pain_agitation (15): Make the audience feel seen in their struggle. Specific, visceral, emotionally honest.
- contrarian (12): Challenge conventional wisdom, expose myths, or flip assumptions.
- curiosity (10): Create an information gap. Make them NEED to know what comes next.
- identity (6): Speak to who they ARE or want to be. Make them feel part of a tribe.
- authority (4): Position the business as the expert without being preachy.
- transformation (3): Paint the before/after in one sentence.

Respond with ONLY valid JSON (no markdown fencing):

[
  { "text": "<hook text>", "category": "<category>" }
]

Rules:
- Use the audience's OWN language from the language map — not marketing speak
- Reference specific locations, scenarios, and situations from the research
- Each hook must work as a standalone sentence — no context needed
- Hooks should be emotionally charged but not manipulative
- Contrarian hooks should challenge REAL beliefs the audience holds, not strawmen
- No generic self-help language ("unlock your potential", "transform your life")
- Vary sentence structure — some short and punchy, some longer and descriptive`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Array<{
    text: string;
    category: string;
  }>;

  // Validate categories
  const validCategories: HookCategory[] = [
    "pain_agitation",
    "contrarian",
    "curiosity",
    "identity",
    "authority",
    "transformation",
  ];

  return parsed.map((h) => ({
    text: h.text,
    category: validCategories.includes(h.category as HookCategory)
      ? (h.category as HookCategory)
      : "curiosity",
  }));
}
