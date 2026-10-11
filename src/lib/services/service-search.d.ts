export type ServiceSearch = {
  category?: string; city?: string; locality?: string; postalCode?: string; countryCode?: string;
  latitude?: number | null; longitude?: number | null; radiusKm?: number | null; limit?: number;
};
export class ServiceSearchError extends Error {}
export function normalizeServiceSearch(input?: URLSearchParams | ServiceSearch | Record<string, unknown>): Required<ServiceSearch>;
export function haversineDistanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number;
export function normalizePostalCode(value: unknown): string;
export function matchServiceLocation(location: Record<string, unknown> | null, search: Required<ServiceSearch>): { matches: boolean; distanceKm: number | null };
