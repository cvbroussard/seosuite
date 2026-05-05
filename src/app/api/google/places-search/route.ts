import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/places-search?q=Pittsburgh[&type=address]
 *
 * Default (no type / type=region): city/region predictions — used by Compose
 * Reach for service-area targeting.
 *
 * type=address: full predictions (establishments + street addresses + regions) —
 * used by Settings → Business Location for the canonical sites.place_id, where
 * the subscriber is identifying their actual business or street address, not a
 * service area.
 *
 * Uses Google Places API (New) — Autocomplete endpoint, US region restricted.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type"); // "address" | null
  if (!query || query.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      predictions: [
        { placeId: `manual_${query.replace(/\s+/g, "_").toLowerCase()}`, placeName: query },
      ],
    });
  }

  try {
    // Region mode (default): city/sublocality/admin areas only.
    // Address mode: omit includedPrimaryTypes so all types (establishment,
    // street_address, premise, etc.) are returned.
    const requestBody: Record<string, unknown> = {
      input: query,
      includedRegionCodes: ["us"],
    };
    if (type !== "address") {
      requestBody.includedPrimaryTypes = [
        "locality",
        "sublocality",
        "administrative_area_level_1",
        "administrative_area_level_2",
      ];
    }

    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ predictions: [] });
    }

    const data = await res.json();
    const predictions = (data.suggestions || [])
      .filter((s: Record<string, unknown>) => s.placePrediction)
      .map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
        placeId: s.placePrediction.placeId,
        placeName: s.placePrediction.text.text,
      }));

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
