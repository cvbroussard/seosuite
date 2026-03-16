import Anthropic from "@anthropic-ai/sdk";
import type { AudienceResearch, OnboardingInput } from "./types";

const anthropic = new Anthropic();

/**
 * Generate deep audience research from onboarding input.
 * This is the heaviest AI call — produces transformation journey,
 * urgency gateway, pain points, language map, congregation points,
 * and competitive landscape.
 */
export async function generateAudienceResearch(
  input: OnboardingInput
): Promise<AudienceResearch> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a world-class brand strategist and audience researcher. Given the business owner's input below, produce a comprehensive audience intelligence report.

## Business Owner Input

**Business description:** ${input.step1.businessDescription}
**Ideal client:** ${input.step1.idealClient}
**Service area:** ${input.step1.serviceArea}

**Biggest challenge overcome:** ${input.step2.biggestChallenge}
**Proudest achievement:** ${input.step2.proudestAchievement}
**What makes them different:** ${input.step2.whatMakesYouDifferent}

**Competitors:** ${input.step3.competitorNames.join(", ") || "Not specified"}
**What clients say about alternatives:** ${input.step3.whatClientsSayAboutOthers || "Not specified"}

## Instructions

Produce a deep audience research report. Be specific to their geography, industry, and client type. Use real-world details — name specific locations, venues, neighborhoods, platforms. Do NOT be generic.

Respond with ONLY valid JSON (no markdown fencing):

{
  "transformationJourney": {
    "currentState": "<vivid 3-4 sentence description of the audience's current painful reality — use specific emotional language and concrete scenarios>",
    "desiredState": "<vivid 3-4 sentence description of the life the audience wants — specific, tangible outcomes they daydream about>"
  },
  "urgencyGateway": {
    "problem": "<the #1 headache in 5-8 words>",
    "whyUrgent": "<2-3 sentences on why this problem demands action NOW — financial, social, or emotional cost of waiting>",
    "failedSolutions": ["<3 things the audience has already tried that didn't work — be specific about WHY each fails>"],
    "aspirinSolution": "<the immediate-relief protocol — a named, actionable solution the business offers that addresses the urgency>"
  },
  "painPoints": [
    {
      "pain": "<specific pain point name>",
      "severity": "critical|moderate|low",
      "emotionalContext": "<what this feels like emotionally>",
      "realQuotes": ["<2 quotes that sound like real things these people would say — use their actual language, not marketing language>"]
    }
  ],
  "languageMap": {
    "painPhrases": ["<5 phrases the audience actually uses when describing their problem — colloquial, not clinical>"],
    "desirePhrases": ["<5 phrases the audience uses when describing what they want>"],
    "searchPhrases": ["<5 realistic search queries this audience types into Google>"],
    "emotionalTriggers": ["<5 emotional states that drive action — 2-3 words each>"]
  },
  "congregationPoints": [
    {
      "platform": "reddit|youtube|podcast|influencer|community|facebook|forum",
      "name": "<specific name>",
      "detail": "<why relevant, subscriber count if applicable>"
    }
  ],
  "competitiveLandscape": {
    "existingSolutions": [
      {
        "name": "<competitor type or name>",
        "positioning": "<how they position themselves>",
        "complaints": ["<2-3 real complaints about this type of solution>"]
      }
    ],
    "marketGaps": ["<3 gaps in the market that the business can exploit>"],
    "positioningOpportunities": ["<3 specific positioning angles — named, not generic>"]
  }
}

Rules:
- Generate exactly 5 pain points (2 critical, 2 moderate, 1 low)
- Generate exactly 6-8 congregation points across different platforms
- Generate exactly 2-3 existing solutions in competitive landscape
- All quotes must sound authentic — use contractions, emotional language, real frustration
- Be hyper-specific to the service area and industry — reference real locations, real scenarios
- Pain phrases and desire phrases must be in the audience's OWN language, not marketing language`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as AudienceResearch;
}
