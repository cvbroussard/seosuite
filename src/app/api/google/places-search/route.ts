import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/places-search?q=Pittsburgh
 * Returns place predictions for service area selection.
 * Uses Google Places Autocomplete API (cities/regions only).
 */
export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q");
  if (!query || query.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    // Fallback: return a simple text-based result without Places API
    return NextResponse.json({
      predictions: [
        { placeId: `manual_${query.replace(/\s+/g, "_").toLowerCase()}`, placeName: query },
      ],
    });
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
        new URLSearchParams({
          input: query,
          types: "(regions)",
          components: "country:us",
          key: apiKey,
        })
    );

    if (!res.ok) {
      return NextResponse.json({ predictions: [] });
    }

    const data = await res.json();
    const predictions = (data.predictions || []).map((p: Record<string, unknown>) => ({
      placeId: p.place_id as string,
      placeName: p.description as string,
    }));

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
