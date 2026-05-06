/**
 * Google Time Zone API — resolve IANA timezone name from lat/lon.
 *
 * Used in the canonical place persistence chain: when a subscriber
 * picks a place via LocationPicker, the backend writes
 * sites.place_lat/place_lon then calls this helper to populate
 * sites.timezone. The Schedule UI, On Deck page, and countdown
 * component all rely on this being set before they can render
 * subscriber-anchored times.
 *
 * Returns null on failure (missing API key, network error, Google
 * returned a non-OK status). Callers should treat null as "couldn't
 * resolve" — sites.timezone stays NULL until next pick or backfill.
 */
const TIMEZONE_API = "https://maps.googleapis.com/maps/api/timezone/json";

export async function getTimezoneForCoords(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // Google's Time Zone API needs a timestamp in seconds — any current
  // timestamp works for resolving the IANA zone; DST offset isn't what
  // we want (we want the zone name, which is timestamp-independent).
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `${TIMEZONE_API}?location=${latitude},${longitude}&timestamp=${timestamp}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK") return null;
    return (data.timeZoneId as string) || null;
  } catch {
    return null;
  }
}
