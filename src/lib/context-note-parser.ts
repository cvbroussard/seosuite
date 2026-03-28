import { sql } from "@/lib/db";

interface ParsedVendor {
  vendorId: string;
  name: string;
  urls: string[];
}

interface ParseResult {
  vendorIds: string[];
  vendorLinks: string[]; // "Name: url" format for blog generator
}

/**
 * Parse vendor hashtags and inline URLs from a context note.
 *
 * Hashtags: #MitchelandMitchel → matches vendor slug
 * URLs: https://thermador.com/wine-refrigeration → associated with
 *   the nearest preceding hashtag, or standalone if no hashtag nearby
 *
 * Returns vendor IDs for asset_vendors and a link array for the blog generator.
 */
export async function parseContextNote(
  contextNote: string,
  subscriberId: string
): Promise<ParseResult> {
  if (!contextNote) return { vendorIds: [], vendorLinks: [] };

  // Extract all hashtags
  const hashtagMatches = contextNote.match(/#([a-zA-Z0-9_]+)/g) || [];
  const hashtags = hashtagMatches.map((h) => h.slice(1).toLowerCase());

  // Extract all URLs
  const urlMatches = contextNote.match(/https?:\/\/[^\s,]+/g) || [];

  if (hashtags.length === 0 && urlMatches.length === 0) {
    return { vendorIds: [], vendorLinks: [] };
  }

  // Fetch all vendors for this subscriber
  const vendors = await sql`
    SELECT id, name, slug, url FROM vendors WHERE subscriber_id = ${subscriberId}
  `;

  const vendorMap = new Map<string, { id: string; name: string; url: string | null }>();
  for (const v of vendors) {
    vendorMap.set(v.slug as string, {
      id: v.id as string,
      name: v.name as string,
      url: v.url as string | null,
    });
  }

  // Match hashtags to vendors
  const matched = new Map<string, ParsedVendor>();
  for (const tag of hashtags) {
    const vendor = vendorMap.get(tag);
    if (vendor) {
      if (!matched.has(vendor.id)) {
        matched.set(vendor.id, {
          vendorId: vendor.id,
          name: vendor.name,
          urls: vendor.url ? [vendor.url] : [],
        });
      }
    }
  }

  // Associate URLs with the nearest preceding hashtag vendor,
  // or treat as standalone links
  for (const url of urlMatches) {
    const urlIndex = contextNote.indexOf(url);

    // Find the nearest hashtag before this URL
    let nearestVendor: ParsedVendor | null = null;
    let nearestDist = Infinity;

    for (const htMatch of hashtagMatches) {
      const htIndex = contextNote.indexOf(htMatch);
      if (htIndex < urlIndex) {
        const dist = urlIndex - htIndex;
        if (dist < nearestDist) {
          const slug = htMatch.slice(1).toLowerCase();
          const vendor = vendorMap.get(slug);
          if (vendor && matched.has(vendor.id)) {
            nearestVendor = matched.get(vendor.id)!;
            nearestDist = dist;
          }
        }
      }
    }

    // Also try matching URL domain to a vendor
    if (!nearestVendor) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        for (const [, vendor] of matched) {
          if (vendor.urls.some((u) => u.includes(domain))) {
            nearestVendor = vendor;
            break;
          }
        }
      } catch { /* invalid URL */ }
    }

    if (nearestVendor) {
      if (!nearestVendor.urls.includes(url)) {
        nearestVendor.urls.push(url);
      }
    }
    // Standalone URLs without a vendor match are ignored —
    // they'll pass through to the AI naturally via the context note
  }

  // Build results
  const vendorIds: string[] = [];
  const vendorLinks: string[] = [];

  for (const [, vendor] of matched) {
    vendorIds.push(vendor.vendorId);
    for (const url of vendor.urls) {
      vendorLinks.push(`${vendor.name}: ${url}`);
    }
  }

  return { vendorIds, vendorLinks };
}

/**
 * Strip hashtags from a context note for cleaner display/AI input.
 * Keeps the rest of the text intact.
 */
export function stripHashtags(note: string): string {
  return note.replace(/#[a-zA-Z0-9_]+/g, "").replace(/\s{2,}/g, " ").trim();
}
