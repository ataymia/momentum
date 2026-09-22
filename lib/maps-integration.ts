import type { Account } from "./types";

export type BusinessLookupResult = {
  providerId: string;
  providerPlaceId: string;
  name: string;
  streetAddress: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
};

export type BusinessLookupProvider = {
  id: string;
  label: string;
  searchNearby: (input: { latitude: number; longitude: number; query?: string }) => Promise<BusinessLookupResult[]>;
};

export type MapsIntegrationStatus = {
  mapTiles: "pending-provider" | "configured";
  businessLookup: "pending-provider" | "configured";
  providerLabel?: string;
};

/**
 * No provider is selected yet. Keep provider selection behind this seam so Google Maps/Places,
 * Mapbox, HERE, or another approved provider can be wired later without changing CRM workflows.
 */
export function configuredBusinessLookupProvider(): BusinessLookupProvider | null {
  return null;
}

export function mapsIntegrationStatus(): MapsIntegrationStatus {
  const provider = configuredBusinessLookupProvider();
  return {
    mapTiles: "pending-provider",
    businessLookup: provider ? "configured" : "pending-provider",
    providerLabel: provider?.label,
  };
}

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export function captureCurrentDeviceLocation(): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location services are not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
      }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Current location could not be captured.")),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  });
}

export function accountHasCoordinates(account: Account) {
  return Number.isFinite(account.latitude) && Number.isFinite(account.longitude);
}

export type ProjectedMapPoint = { accountId: string; x: number; y: number };

/**
 * Provider-free fallback plot. It is not a street map; it lets the live CRM render and click known
 * coordinates now while exact basemap tiles and ZIP/polygon boundaries remain provider-dependent.
 */
export function projectAccounts(accounts: Account[], width = 1000, height = 620, padding = 55): ProjectedMapPoint[] {
  const located = accounts.filter(accountHasCoordinates);
  if (!located.length) return [];
  const lats = located.map((account) => account.latitude!);
  const lngs = located.map((account) => account.longitude!);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  return located.map((account) => ({
    accountId: account.id,
    x: padding + ((account.longitude! - minLng) / lngSpan) * (width - padding * 2),
    y: height - padding - ((account.latitude! - minLat) / latSpan) * (height - padding * 2),
  }));
}
