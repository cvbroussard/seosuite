/**
 * Brand Intelligence Playbook — typed schema matching BraveBrand's
 * brand playbook JSON structure. This is the core artifact that feeds
 * every downstream generation (blogs, captions, hooks, distribution).
 */

// ── Audience Research ──────────────────────────────────────────────

export interface TransformationJourney {
  currentState: string;
  desiredState: string;
}

export interface UrgencyGateway {
  problem: string;
  whyUrgent: string;
  failedSolutions: string[];
  aspirinSolution: string;
}

export interface PainPoint {
  pain: string;
  severity: "critical" | "moderate" | "low";
  emotionalContext: string;
  realQuotes: string[];
}

export interface LanguageMap {
  painPhrases: string[];
  desirePhrases: string[];
  searchPhrases: string[];
  emotionalTriggers: string[];
}

export interface CongregationPoint {
  platform: string; // reddit, youtube, podcast, influencer, community
  name: string;
  detail?: string;  // subscriber count, relevance note
}

export interface Competitor {
  name: string;
  positioning: string;
  complaints: string[];
}

export interface CompetitiveLandscape {
  existingSolutions: Competitor[];
  marketGaps: string[];
  positioningOpportunities: string[];
}

export interface AudienceResearch {
  transformationJourney: TransformationJourney;
  urgencyGateway: UrgencyGateway;
  painPoints: PainPoint[];
  languageMap: LanguageMap;
  congregationPoints: CongregationPoint[];
  competitiveLandscape: CompetitiveLandscape;
}

// ── Brand Positioning ──────────────────────────────────────────────

export interface BrandAngle {
  name: string;
  tagline: string;
  targetPain: string;
  targetDesire: string;
  tone: string;
  contentThemes: string[];
}

export interface BrandPositioning {
  selectedAngles: BrandAngle[];
}

// ── Content Hooks ──────────────────────────────────────────────────

export type HookCategory =
  | "pain_agitation"
  | "contrarian"
  | "curiosity"
  | "identity"
  | "authority"
  | "transformation";

export interface ContentHook {
  text: string;
  category: HookCategory;
}

export type HookRating = "loved" | "liked" | "skipped";

export interface RatedHook extends ContentHook {
  rating: HookRating;
}

export interface ContentHooks {
  lovedHooks: ContentHook[];
  likedHooks: ContentHook[];
  totalRated: number;
  summary: { loved: number; liked: number; skipped: number };
}

// ── Offer Core ─────────────────────────────────────────────────────

export interface OfferStatement {
  finalStatement: string;
  emotionalCore: string;
  universalMotivatorsUsed: string[];
}

export interface ProgramNameOption {
  name: string;
  uniqueMechanism: string;
  rationale: string;
}

export interface OfferCore {
  offerStatement: OfferStatement;
  benefits: string[];
  useCases: string[];
  hiddenBenefits: string[];
  programNameOptions: ProgramNameOption[];
}

// ── Full Playbook ──────────────────────────────────────────────────

export interface BrandPlaybook {
  generatedAt: string;
  version: string;
  audienceResearch: AudienceResearch;
  brandPositioning: BrandPositioning;
  contentHooks: ContentHooks;
  offerCore: OfferCore;
}

// ── Onboarding Wizard Steps ────────────────────────────────────────

export interface OnboardingStep1 {
  businessDescription: string;   // "I help [who] achieve [what] through [how]"
  idealClient: string;           // demographics, situation, struggles
  serviceArea: string;           // geographic focus
}

export interface OnboardingStep2 {
  biggestChallenge: string;      // from your story
  proudestAchievement: string;
  whatMakesYouDifferent: string;
}

export interface OnboardingStep3 {
  competitorNames: string[];     // who else serves your audience
  whatClientsSayAboutOthers: string; // complaints about alternatives
}

/** Combined onboarding input — all steps collected before AI generation */
export interface OnboardingInput {
  step1: OnboardingStep1;
  step2: OnboardingStep2;
  step3: OnboardingStep3;
}

// ── Wizard State ───────────────────────────────────────────────────

export type WizardPhase =
  | "onboarding"       // collecting initial input (steps 1-3)
  | "researching"      // AI generating audience research
  | "angles"           // presenting brand angles for selection
  | "hooks"            // presenting hooks for rating
  | "generating"       // AI generating offer core
  | "complete";        // playbook finalized

export interface WizardState {
  phase: WizardPhase;
  siteId: string;
  onboardingInput?: OnboardingInput;
  generatedAngles?: BrandAngle[];
  selectedAngleIndices?: number[];
  generatedHooks?: ContentHook[];
  ratedHooks?: RatedHook[];
  playbook?: BrandPlaybook;
}
