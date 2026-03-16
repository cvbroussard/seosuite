/** Core Web Vitals result for a single URL. */
export interface CwvResult {
  url: string;
  lcp: CwvMetric | null;
  inp: CwvMetric | null;
  cls: CwvMetric | null;
  fcp: CwvMetric | null;
  performanceScore: number | null;
  error?: string;
}

export interface CwvMetric {
  value: number;
  unit: "ms" | "score";
  status: "good" | "needs_improvement" | "poor";
}

// Thresholds per Google's CWV standards
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
} as const;

/**
 * Fetch Core Web Vitals for a URL via Google PageSpeed Insights API.
 * Gracefully returns null metrics if the API is unavailable or no key is set.
 */
export async function getCoreWebVitals(url: string): Promise<CwvResult> {
  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    return {
      url,
      lcp: null,
      inp: null,
      cls: null,
      fcp: null,
      performanceScore: null,
      error: "PAGESPEED_API_KEY not configured",
    };
  }

  const apiUrl = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
  );
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("strategy", "mobile");
  apiUrl.searchParams.set("key", apiKey);
  apiUrl.searchParams.set("category", "performance");

  try {
    const res = await fetch(apiUrl.href, {
      signal: AbortSignal.timeout(60000), // PSI can be slow
    });

    if (!res.ok) {
      return {
        url,
        lcp: null,
        inp: null,
        cls: null,
        fcp: null,
        performanceScore: null,
        error: `PageSpeed API returned ${res.status}`,
      };
    }

    const data = await res.json();
    return parsePageSpeedResponse(url, data);
  } catch (err) {
    return {
      url,
      lcp: null,
      inp: null,
      cls: null,
      fcp: null,
      performanceScore: null,
      error: err instanceof Error ? err.message : "PageSpeed API request failed",
    };
  }
}

function parsePageSpeedResponse(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): CwvResult {
  const lighthouse = data.lighthouseResult;
  const performanceScore = lighthouse?.categories?.performance?.score
    ? Math.round(lighthouse.categories.performance.score * 100)
    : null;

  const audits = lighthouse?.audits || {};

  const lcp = parseMetric(audits["largest-contentful-paint"], "lcp", "ms");
  const inp = parseMetric(
    audits["interaction-to-next-paint"] || audits["max-potential-fid"],
    "inp",
    "ms"
  );
  const cls = parseMetric(
    audits["cumulative-layout-shift"],
    "cls",
    "score"
  );
  const fcp = parseMetric(audits["first-contentful-paint"], "fcp", "ms");

  return { url, lcp, inp, cls, fcp, performanceScore };
}

function parseMetric(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: any,
  metric: keyof typeof THRESHOLDS,
  unit: "ms" | "score"
): CwvMetric | null {
  if (!audit || audit.numericValue === undefined) return null;

  const value = unit === "ms" ? Math.round(audit.numericValue) : audit.numericValue;
  const threshold = THRESHOLDS[metric];

  let status: CwvMetric["status"];
  if (value <= threshold.good) {
    status = "good";
  } else if (value <= threshold.poor) {
    status = "needs_improvement";
  } else {
    status = "poor";
  }

  return { value, unit, status };
}
