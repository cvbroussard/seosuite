import Anthropic from "@anthropic-ai/sdk";
import type { AudienceResearch, BrandAngle, OnboardingInput } from "./types";

const anthropic = new Anthropic();

/**
 * Generate 4 brand positioning angles from audience research.
 * The subscriber selects which angle(s) resonate — this shapes
 * all downstream content generation.
 */
export async function generateBrandAngles(
  input: OnboardingInput,
  research: AudienceResearch
): Promise<BrandAngle[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a brand positioning strategist. Given the audience research below, generate 4 distinct brand positioning angles for this business.

## Business
${input.step1.businessDescription}
Service area: ${input.step1.serviceArea}
Differentiator: ${input.step2.whatMakesYouDifferent}

## Audience Research
Current state: ${research.transformationJourney.currentState}
Desired state: ${research.transformationJourney.desiredState}
#1 Headache: ${research.urgencyGateway.problem}
Pain points: ${research.painPoints.map((p) => p.pain).join(", ")}
Market gaps: ${research.competitiveLandscape.marketGaps.join("; ")}
Positioning opportunities: ${research.competitiveLandscape.positioningOpportunities.join("; ")}

## Instructions

Generate exactly 4 brand angles. Each angle should be a distinct creative positioning — a different lens through which the business tells its story. They should feel like different "characters" the brand could play.

Make them hyper-specific to the geography and niche. Use local landmarks, cultural references, and audience aspirations. Do NOT be generic.

Respond with ONLY valid JSON (no markdown fencing):

[
  {
    "name": "<catchy 3-5 word angle name — specific, memorable>",
    "tagline": "<1 sentence positioning statement in quotes — punchy, emotionally resonant>",
    "targetPain": "<which specific pain this angle addresses>",
    "targetDesire": "<which specific desire this angle fulfills>",
    "tone": "<2-3 descriptive words for the tone of content under this angle>",
    "contentThemes": ["<3 specific content theme ideas — each reads like a blog series or social content theme>"]
  }
]

Rules:
- Each angle must target a DIFFERENT primary pain point or desire
- Names should be creative and memorable, not generic marketing terms
- Taglines should be quotable — something the subscriber would proudly put on their website
- Content themes must be concrete enough to generate articles from (not "tips and tricks")
- At least one angle should be contrarian (challenges conventional wisdom)
- At least one angle should be aspirational (paints a picture of the desired life)`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as BrandAngle[];
}
