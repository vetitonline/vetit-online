import type { FeaturedProduct, ProductAnimal, ProductCategory } from './featured-products';

export type CatalogRequestFilters = {
  query?: string;
  animal?: string;
  category?: string;
  product?: string;
  minPriceRupees?: number | string;
  maxPriceRupees?: number | string;
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'name';
  page?: number;
  pageSize?: number;
};

export type CatalogApiResponse = {
  apiVersion: 1;
  state: 'available' | 'unconfigured';
  marketCode: 'IN';
  products: FeaturedProduct[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number; hasPrevious: boolean; hasNext: boolean; truncated: boolean };
  filters: { query: string; animal: string | null; category: string | null; product: string | null; minPriceMinor: number | null; maxPriceMinor: number | null; sort: string };
  taxonomy: { animals: ProductAnimal[]; categories: ProductCategory[] };
};

export class CatalogClientError extends Error { status: number }
export function buildCatalogUrl(filters?: CatalogRequestFilters, baseUrl?: string): string;
export function fetchCatalog(filters?: CatalogRequestFilters, options?: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<CatalogApiResponse>;
