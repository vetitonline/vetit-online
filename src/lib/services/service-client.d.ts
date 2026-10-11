import type { ServiceSearch } from './service-search.js';
export type ServiceSearchResponse = {
  apiVersion: 1;
  state: 'available' | 'unconfigured' | 'error' | 'invalid_request' | 'unavailable';
  services: Array<{
    id: string; businessId: string; title: string; description: string; categorySlug: string | null; categoryName: string;
    mode: string | null; city: string | null; locality: string | null; pricePaise: number | null; currencyCode: string;
    durationMinutes: number | null; providerName: string; providerSlug: string | null; distanceKm: number | null;
  }>;
  categories: Array<{ slug: string; name: string; parentSlug: string | null; requiresProfessionalVerification: boolean; requiresLegalReview: boolean }>;
  truncated: boolean;
};
export class ServiceClientError extends Error { status: number; }
export function requestServices(args?: {
  baseUrl?: string; filters?: ServiceSearch; location?: Pick<ServiceSearch, 'latitude' | 'longitude' | 'radiusKm'> | null;
  signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<ServiceSearchResponse>;
