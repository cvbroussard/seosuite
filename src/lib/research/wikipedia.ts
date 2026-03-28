/**
 * Research enrichment for blog content.
 * AI-powered entity extraction + Wikipedia/Wikimedia lookups.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface WikiSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: string;
  images: Array<{ url: string; description: string }>;
}

interface ExtractedEntities {
  brands: string[];
  materials: string[];
  techniques: string[];
  products: string[];
}

/**
 * AI-powered entity extraction from a context note.
 * Industry-agnostic — works for construction, food, beauty, fitness, etc.
 * Uses Claude Haiku for speed and cost.
 */
export async function extractResearchTerms(contextNote: string): Promise<string[]> {
  if (!contextNote || contextNote.length < 10) return [];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Extract named entities from this content note that would benefit from research. Return ONLY valid JSON, no markdown.

Content note: "${contextNote}"

Extract named entities and make them Wikipedia-searchable. Add category context to disambiguate:
- brands: Company names with their industry (e.g., "Wolf appliances", "Thermador refrigerator", "Sub-Zero refrigeration")
- materials: Specific materials with context (e.g., "zellige tile", "black walnut wood", "Calacatta marble")
- techniques: Industry methods (e.g., "inset cabinetry", "sous vide cooking")
- products: Specific product lines (e.g., "Brizo Litze faucet", "Viking Professional range")

IMPORTANT: Add a disambiguating word to each term so Wikipedia finds the right article.
For example: "Sub-Zero" alone → Mortal Kombat character. "Sub-Zero refrigeration" → the appliance brand.

Only include terms that are specific and researchable. Skip generic words and small/local vendors unlikely to have Wikipedia pages.
If nothing specific is found, return empty arrays.

{"brands":[],"materials":[],"techniques":[],"products":[]}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const entities: ExtractedEntities = JSON.parse(cleaned);

    // Flatten all entities into unique research terms, max 5
    const all = [
      ...entities.brands,
      ...entities.products,
      ...entities.materials,
      ...entities.techniques,
    ];
    return [...new Set(all)].slice(0, 5);
  } catch (err) {
    console.warn("Entity extraction failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Search Wikipedia for a term and return a brief summary + images.
 */
export async function lookupWikipedia(term: string): Promise<WikiSummary | null> {
  try {
    // Direct page summary lookup
    const searchRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.type === "standard" && data.extract) {
        const images = await fetchWikiImages(data.title);
        return {
          title: data.title,
          extract: data.extract.slice(0, 500),
          description: data.description,
          thumbnail: data.thumbnail?.source,
          images,
        };
      }
    }

    // Fallback: search API
    const fallbackRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&srlimit=1&origin=*`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!fallbackRes.ok) return null;

    const fallbackData = await fallbackRes.json();
    const firstResult = fallbackData?.query?.search?.[0];
    if (!firstResult) return null;

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!summaryRes.ok) return null;

    const summaryData = await summaryRes.json();
    if (summaryData.type === "standard" && summaryData.extract) {
      const images = await fetchWikiImages(summaryData.title);
      return {
        title: summaryData.title,
        extract: summaryData.extract.slice(0, 500),
        description: summaryData.description,
        thumbnail: summaryData.thumbnail?.source,
        images,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch images from a Wikipedia article via the MediaWiki API.
 * Returns public domain / CC-licensed images from the article.
 */
async function fetchWikiImages(title: string): Promise<Array<{ url: string; description: string }>> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=images&format=json&imlimit=10&origin=*`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as Record<string, unknown>;
    const imageList = (page?.images || []) as Array<{ title: string }>;

    // Filter out icons, logos, and common non-content images
    const contentImages = imageList.filter((img) => {
      const name = img.title.toLowerCase();
      return !name.includes("icon") && !name.includes("logo") && !name.includes("flag")
        && !name.includes("symbol") && !name.includes("commons-logo")
        && (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png"));
    }).slice(0, 3);

    // Get actual URLs for filtered images
    const results: Array<{ url: string; description: string }> = [];

    for (const img of contentImages) {
      try {
        const infoRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`,
          { signal: AbortSignal.timeout(5000) }
        );

        if (!infoRes.ok) continue;

        const infoData = await infoRes.json();
        const infoPages = infoData.query?.pages || {};
        const infoPage = Object.values(infoPages)[0] as Record<string, unknown>;
        const imageInfo = (infoPage?.imageinfo as Array<Record<string, unknown>>)?.[0];

        if (imageInfo?.url) {
          const extMeta = imageInfo.extmetadata as Record<string, { value: string }> | undefined;
          const desc = extMeta?.ImageDescription?.value?.replace(/<[^>]+>/g, "").slice(0, 100)
            || img.title.replace("File:", "").replace(/\.[^.]+$/, "").replace(/_/g, " ");

          results.push({
            url: imageInfo.url as string,
            description: desc,
          });
        }
      } catch {
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Check if a Wikipedia result is relevant to the original search context.
 * Filters out pop culture, fictional characters, and other irrelevant matches.
 */
function isRelevantResult(summary: WikiSummary, searchTerm: string, contextNote: string): boolean {
  const desc = (summary.description || "").toLowerCase();
  const extract = summary.extract.toLowerCase();

  // Reject fictional characters, entertainment, electronics, software, and other irrelevant domains
  const irrelevantPatterns = [
    /fictional character/i, /video game/i, /television/i, /tv series/i,
    /\bactor\b/i, /\bactress\b/i, /\bsinger\b/i, /\bmusician\b/i,
    /\bathlete\b/i, /\bfilm\b/i, /\bmovie\b/i, /\bband\b/i,
    /\bnovel\b/i, /\bcomic\b/i, /\banime\b/i, /\bmanga\b/i,
    /mortal kombat/i, /disney/i, /marvel/i, /dc comics/i,
    /\bpolitician\b/i, /\bfootball\b/i, /\bbaseball\b/i, /\bsoccer\b/i,
    /\bsoftware\b/i, /\bcomputer\b/i, /\bsimulator\b/i, /\belectronic circuit\b/i,
    /\bprogramming\b/i, /\bsemiconductor\b/i, /\balgorithm\b/i,
    /\bcity in\b/i, /\btown in\b/i, /\bvillage in\b/i, /\bmunicipality\b/i,
    /\bstate of\b/i, /\bprovince\b/i, /\bcounty in\b/i, /\bdistrict\b/i,
  ];

  const combined = desc + " " + extract;
  for (const pattern of irrelevantPatterns) {
    if (pattern.test(combined)) return false;
  }

  return true;
}

/**
 * Research all entities from a context note and return combined background.
 * Includes text summaries and image references.
 */
export async function researchContextNote(contextNote: string): Promise<string> {
  if (!contextNote) return "";

  const terms = await extractResearchTerms(contextNote);
  if (terms.length === 0) return "";

  const results: string[] = [];

  for (const term of terms) {
    // Add context to disambiguate — try the specific term first,
    // then fall back to term + category hint from context
    let summary = await lookupWikipedia(term);

    // Check relevance — reject pop culture / fictional matches
    if (summary && !isRelevantResult(summary, term, contextNote)) {
      // Retry with category context appended
      const categoryHints = ["material", "manufacturer", "appliance", "tile", "woodworking"];
      let found = false;
      for (const hint of categoryHints) {
        if (contextNote.toLowerCase().includes(hint) || term.toLowerCase().includes(hint)) {
          summary = await lookupWikipedia(`${term} ${hint}`);
          if (summary && isRelevantResult(summary, term, contextNote)) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        summary = null; // Drop irrelevant result entirely
      }
    }

    if (summary) {
      let entry = `**${summary.title}**: ${summary.extract}`;

      // Add image references for the blog to use
      if (summary.images.length > 0) {
        entry += "\nReference images (public domain, can be embedded in blog):";
        for (const img of summary.images) {
          entry += `\n- ![${img.description}](${img.url})`;
        }
      } else if (summary.thumbnail) {
        entry += `\nReference image: ![${summary.title}](${summary.thumbnail})`;
      }

      results.push(entry);
    }
  }

  if (results.length === 0) return "";

  return results.join("\n\n");
}
