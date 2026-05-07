/**
 * v2 content generator — shared types.
 *
 * Architecture:
 *   - One core engine + three thin pool adapters (blog/project/service)
 *   - Generator emits an article body + a structured ContentKit
 *   - Per-platform slicer functions deterministically compose captions
 *     from the ContentKit at request time — no LLM at slice time
 *   - Adding a new platform = write one slicer; no schema change
 *
 * See memory: project_tracpost_v2_article_schema.md
 */

export type ContentPool = "blog" | "project" | "service";

/**
 * Pool-agnostic input the core engine consumes. Adapters build this
 * from pool-specific upstream inputs (a seed asset for blog, project
 * metadata for project, service category info for service).
 */
export interface ContentSpec {
  pool: ContentPool;
  siteId: string;

  /** Title hint or theme — shapes generation but doesn't dictate the final title. */
  topicHint: string;
  /** Optional editorial angle (e.g., "first-person craft story", "authority overview"). */
  intent?: string;

  /** Required hero asset. Promoted to manifest as role='hero', slot 0. */
  heroAssetId: string;
  /** Optional video poster — only used when hero is video. */
  posterAssetId?: string;
  /** Blog pool only — the asset that triggered generation, kept for analytics. */
  seedAssetId?: string;
  /** Additional assets the LLM may place in body via {{asset:UUID}} placeholders. */
  bodyAssetIds?: string[];

  /** blog → service link (authority articles tagged to a service category). */
  serviceId?: string;

  /** Project pool extras. */
  projectMeta?: {
    startDate?: string;
    endDate?: string;
  };

  /** Service pool extras. */
  serviceMeta?: {
    priceRange?: string;
    duration?: string;
    displayOrder?: number;
  };

  /** Categorization shared across pools. */
  contentPillars?: string[];
  contentTags?: string[];

  /** Status override; pool defaults apply otherwise. */
  status?: string;
}

/**
 * The structured content kit — every per-platform slicer reads from this.
 * Generated ONCE at article creation time; persisted to *_v2.content_kit.
 *
 * Adding a new platform format means writing a new slicer that reads
 * these fields. Adding a new INGREDIENT type means extending this
 * interface + updating the kit-generation prompt + a backfill script
 * that extracts just the new field from existing article bodies.
 */
export interface ContentKit {
  /** Punchy opening lines, ranked roughly by strength. ≤120 chars each. */
  hooks: string[];
  /** Single-sentence value props. ≤140 chars each. */
  takeaways: string[];
  /** Domain words / proper nouns / location markers worth weaving in. */
  keyTerms: string[];
  /** Specific facts, numbers, names that lend authority. */
  proofPoints: string[];
  /** Natural-language framings for the anchor URL ("see the full breakdown", etc.). */
  inlineLinkContexts: string[];
  /** Short / medium / long CTA variants. */
  ctaVariants: {
    short: string[];   // "Tap the link." "DM us."
    medium: string[];  // "See the full project on our site."
    long: string[];    // "If you're planning a kitchen remodel, the full breakdown is on our blog."
  };
  /** Voice fingerprint — applied uniformly across formats. */
  voiceMarkers: {
    signoffs: string[];
    emojiPolicy: "none" | "sparse" | "frequent";
    exclamationDensity: "low" | "medium" | "high";
    casing: "sentence" | "title" | "lowercase";
  };
}

/** What the body-generation LLM call returns (pre-parse). */
export interface GeneratedBody {
  title: string;
  body: string;            // markdown w/ {{asset:UUID}} placeholders
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentPillars: string[];
  contentTags: string[];
}

/** Output from the slicer for a single platform format. */
export interface SlicedCaption {
  caption: string;
  hashtags: string[];
}

/** Final return after persistence. */
export interface GenerateResult {
  pool: ContentPool;
  id: string;            // v2 row id
  slug: string;
  title: string;
  assetsCount: number;
}
