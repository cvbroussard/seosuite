import Anthropic from "@anthropic-ai/sdk";
import type {
  AudienceResearch,
  BrandAngle,
  ContentHooks,
  OfferCore,
  OnboardingInput,
} from "./types";

const anthropic = new Anthropic();

/**
 * Generate the Offer Core — the emotional foundation of the brand.
 * This is the final generation step, consuming everything upstream:
 * onboarding input, research, selected angles, and curated hooks.
 */
export async function generateOfferCore(
  input: OnboardingInput,
  research: AudienceResearch,
  selectedAngles: BrandAngle[],
  hooks: ContentHooks
): Promise<OfferCore> {
  const topHooks = [
    ...hooks.lovedHooks.map((h) => `[LOVED] "${h.text}"`),
    ...hooks.likedHooks.slice(0, 5).map((h) => `[LIKED] "${h.text}"`),
  ].join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a brand strategist defining the emotional core of a business. Use all the research and subscriber selections below to craft the offer core.

## Business
${input.step1.businessDescription}
Differentiator: ${input.step2.whatMakesYouDifferent}
Achievement: ${input.step2.proudestAchievement}

## Audience
Current state: ${research.transformationJourney.currentState}
Desired state: ${research.transformationJourney.desiredState}
#1 Problem: ${research.urgencyGateway.problem}
Aspirin: ${research.urgencyGateway.aspirinSolution}
Failed solutions: ${research.urgencyGateway.failedSolutions.join("; ")}

## Selected Brand Angle
${selectedAngles.map((a) => `"${a.name}" — ${a.tagline}`).join("\n")}

## Subscriber's Favorite Hooks
${topHooks}

## Instructions

Generate the Offer Core — the emotional foundation that every piece of content, copy, and sales material builds on.

Respond with ONLY valid JSON (no markdown fencing):

{
  "offerStatement": {
    "finalStatement": "<a powerful 2-3 sentence offer statement that contrasts the failed alternatives with this solution — use the 'Unlike X that does Y, [solution] does Z because [reason]' structure>",
    "emotionalCore": "<1 sentence capturing the emotional transformation — from [painful state] to [desired state]>",
    "universalMotivatorsUsed": ["<2-3 universal human motivators this taps into: popularity, inner_peace, wealth, status, belonging, safety, freedom, mastery>"]
  },
  "benefits": [
    "<5 concrete, tangible benefits — what the client actually GETS. Each should be specific enough to visualize>"
  ],
  "useCases": [
    "<5 vivid use cases — 'Imagine...' scenarios painted with specific details from the research. Reference real locations and situations>"
  ],
  "hiddenBenefits": [
    "<3 unexpected transformations the client didn't realize they'd get — emotional, relational, or identity shifts>"
  ],
  "programNameOptions": [
    {
      "name": "<creative program/service name>",
      "uniqueMechanism": "<the named method/protocol/framework>",
      "rationale": "<why this name works for this audience>"
    }
  ]
}

Rules:
- The offer statement must name the failed alternatives explicitly
- Benefits must be concrete and measurable, not vague ("confidence" → "walking into a venue knowing your dog will settle within 30 seconds")
- Use cases must reference REAL locations and scenarios from the audience research
- Hidden benefits should surprise — things the client wouldn't list on a wishlist but deeply values
- Generate exactly 3 program name options
- Each program name must have a unique mechanism — a named protocol, method, or framework`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as OfferCore;
}
