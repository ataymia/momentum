/**
 * Geocoding for business locations.
 *
 * Territory decisions want coordinates, but Momentum must keep working before a provider is configured.
 * The provider sits behind this interface so the territory engine never learns which service is in use,
 * and so supplying Mapbox credentials later is configuration rather than a rewrite.
 *
 * Geocoding is triggered by a material address change, detected with `addressFingerprint`, not by opening
 * a record. Storing `geocodeFingerprint` alongside the coordinates is what makes that possible.
 */

export type GeocodeAddress = {
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type GeocodePrecision = "rooftop" | "street" | "locality" | "postal" | "unknown";

export type GeocodedPoint = {
  latitude: number;
  longitude: number;
  precision: GeocodePrecision;
  provider: string;
  normalizedAddress?: string;
};

export type GeocodeOutcome =
  | { status: "ok"; point: GeocodedPoint }
  | { status: "not-found" }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

export type GeocodeProvider = {
  readonly name: string;
  geocode(address: GeocodeAddress): Promise<GeocodeOutcome>;
};

export type GeocodingConfig = {
  provider: "none" | "mapbox";
  accessToken?: string;
  country?: string;
  /** Re-geocode an unchanged address after this many days. 0 disables refresh. */
  refreshAfterDays: number;
};

export const DEFAULT_GEOCODING_CONFIG: GeocodingConfig = { provider: "none", country: "us", refreshAfterDays: 0 };

/** Coordinates and the address they were derived from, stored on the business location. */
export type LocationGeocode = {
  latitude?: number;
  longitude?: number;
  geocodePrecision?: GeocodePrecision;
  geocodeProvider?: string;
  geocodedAt?: string;
  /** Fingerprint of the address at the time it was geocoded. A mismatch means the address moved. */
  geocodeFingerprint?: string;
  geocodeStatus?: "ok" | "not-found" | "pending-provider" | "error";
};

const part = (value: string | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Stable identity of an address for change detection.
 *
 * Only the fields that can move a pin are included, and they are normalized, so re-typing "Suite 4" as
 * "suite 4" does not trigger a pointless geocode while a genuine street change does.
 */
export function addressFingerprint(address: GeocodeAddress): string {
  return [part(address.streetAddress), part(address.city), part(address.state), part(address.postalCode)].join("|");
}

export const hasCoordinates = (location: LocationGeocode): location is LocationGeocode & { latitude: number; longitude: number } =>
  Number.isFinite(location.latitude) && Number.isFinite(location.longitude);

/** Whether the stored coordinates still describe the current address. */
export function geocodeIsCurrent(location: LocationGeocode, address: GeocodeAddress, config: GeocodingConfig, now = new Date()): boolean {
  if (!hasCoordinates(location)) return false;
  if (location.geocodeFingerprint !== addressFingerprint(address)) return false;
  if (!config.refreshAfterDays) return true;
  const at = location.geocodedAt ? new Date(location.geocodedAt).getTime() : NaN;
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < config.refreshAfterDays * 86_400_000;
}

/** A location needs geocoding when it has a usable address whose coordinates are missing or stale. */
export function needsGeocode(location: LocationGeocode, address: GeocodeAddress, config: GeocodingConfig, now = new Date()): boolean {
  if (!addressIsGeocodable(address)) return false;
  return !geocodeIsCurrent(location, address, config, now);
}

/** Enough of an address to be worth sending to a provider. */
export function addressIsGeocodable(address: GeocodeAddress): boolean {
  const street = part(address.streetAddress);
  const city = part(address.city);
  const postal = part(address.postalCode);
  return Boolean(street && (city || postal));
}

export const formatGeocodeQuery = (address: GeocodeAddress) =>
  [address.streetAddress, address.city, address.state, address.postalCode].map((value) => (value ?? "").trim()).filter(Boolean).join(", ");

/** The record patch to store after a geocode attempt, successful or not. */
export function geocodePatch(address: GeocodeAddress, outcome: GeocodeOutcome, at: string): LocationGeocode {
  const fingerprint = addressFingerprint(address);
  if (outcome.status === "ok") {
    return {
      latitude: outcome.point.latitude,
      longitude: outcome.point.longitude,
      geocodePrecision: outcome.point.precision,
      geocodeProvider: outcome.point.provider,
      geocodedAt: at,
      geocodeFingerprint: fingerprint,
      geocodeStatus: "ok",
    };
  }
  // A failed attempt is recorded without coordinates, so the territory engine can say "not geocoded"
  // rather than silently treating the location as being outside every territory.
  return { geocodeFingerprint: fingerprint, geocodedAt: at, geocodeStatus: outcome.status === "unconfigured" ? "pending-provider" : outcome.status === "not-found" ? "not-found" : "error" };
}

type MapboxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { full_address?: string; match_code?: { confidence?: string } };
};

const MAPBOX_PRECISION: Record<string, GeocodePrecision> = { exact: "rooftop", high: "street", medium: "locality", low: "postal" };

/**
 * Mapbox forward geocoding.
 *
 * Written against the v6 forward endpoint and enabled purely by supplying an access token in
 * `GeocodingConfig`. Until then `resolveGeocodeProvider` returns null and locations are recorded as
 * awaiting a provider instead of being geocoded incorrectly.
 */
export function createMapboxProvider(accessToken: string, country = "us"): GeocodeProvider {
  return {
    name: "mapbox",
    async geocode(address) {
      const query = formatGeocodeQuery(address);
      if (!query) return { status: "not-found" };
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}&limit=1&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url).catch(() => null);
      if (!response) return { status: "error", message: "Could not reach the geocoding service." };
      if (!response.ok) return { status: "error", message: `Geocoding service returned ${response.status}.` };
      const payload = await response.json().catch(() => null) as { features?: MapboxFeature[] } | null;
      const feature = payload?.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!feature || !coordinates || coordinates.length < 2) return { status: "not-found" };
      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { status: "not-found" };
      return {
        status: "ok",
        point: {
          latitude, longitude,
          precision: MAPBOX_PRECISION[feature.properties?.match_code?.confidence ?? ""] ?? "unknown",
          provider: "mapbox",
          normalizedAddress: feature.properties?.full_address,
        },
      };
    },
  };
}

/** Null until a provider is configured. Callers record `pending-provider` rather than inventing a pin. */
export function resolveGeocodeProvider(config: GeocodingConfig): GeocodeProvider | null {
  if (config.provider === "mapbox" && config.accessToken?.trim()) return createMapboxProvider(config.accessToken.trim(), config.country ?? "us");
  return null;
}

const EARTH_RADIUS_MILES = 3958.7613;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in miles. Used for boundary buffers and nothing else. */
export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray casting on the raw lat/lng plane. Adequate at the scale of a sales territory. */
export function pointInPolygon(point: { latitude: number; longitude: number }, polygon: Array<{ latitude: number; longitude: number }>): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.longitude > point.longitude !== b.longitude > point.longitude;
    if (!straddles) continue;
    const latitudeAtCrossing = a.latitude + ((point.longitude - a.longitude) * (b.latitude - a.latitude)) / (b.longitude - a.longitude);
    if (point.latitude < latitudeAtCrossing) inside = !inside;
  }
  return inside;
}

/** Shortest distance in miles from a point to a polygon edge. Zero when the point is inside. */
export function distanceToPolygonMiles(point: { latitude: number; longitude: number }, polygon: Array<{ latitude: number; longitude: number }>): number {
  if (pointInPolygon(point, polygon)) return 0;
  let closest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    closest = Math.min(closest, distanceToSegmentMiles(point, a, b));
  }
  return closest;
}

function distanceToSegmentMiles(point: { latitude: number; longitude: number }, a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = b.latitude - a.latitude;
  const dLon = b.longitude - a.longitude;
  if (dLat === 0 && dLon === 0) return distanceMiles(point, a);
  const t = Math.max(0, Math.min(1, ((point.latitude - a.latitude) * dLat + (point.longitude - a.longitude) * dLon) / (dLat * dLat + dLon * dLon)));
  return distanceMiles(point, { latitude: a.latitude + t * dLat, longitude: a.longitude + t * dLon });
}
