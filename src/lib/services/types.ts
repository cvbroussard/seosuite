/**
 * Shared types for the Service entity + GBP categorization.
 */

export interface Service {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  priceRange: string | null;
  duration: string | null;
  displayOrder: number;
  heroAssetId: string | null;
  metadata: ServiceMetadata;
  source: "manual" | "auto" | "edited";
  createdAt: string;
  updatedAt: string;
}

export interface ServiceMetadata {
  /** GBP categories relevant to this specific service. Usually 1. */
  gbpCategoryIds?: string[];
  /** Optional free-form CTA override for the tile/detail page. */
  ctaLabel?: string;
  ctaHref?: string;
  [key: string]: unknown;
}

export interface GbpCategory {
  gcid: string;
  name: string;
  parentGcid: string | null;
  keywords: string[];
}

export interface SiteGbpCategory {
  id: string;
  siteId: string;
  gcid: string;
  isPrimary: boolean;
  reasoning: string | null;
  confidence: number | null;
  chosenAt: string;
  chosenBy: "auto" | "admin" | "tenant";
  /** Joined from gbp_categories for display. */
  category?: GbpCategory;
}

export interface CategorizationResult {
  primary: { gcid: string; name: string; reasoning: string; confidence: number };
  additional: Array<{ gcid: string; name: string; reasoning: string; confidence: number }>;
}
