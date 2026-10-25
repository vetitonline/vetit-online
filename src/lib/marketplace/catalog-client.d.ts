import type { FeaturedProduct, ProductAnimal, ProductCategory } from './catalog-types.js';

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

export type CatalogWindowFilters=Omit<CatalogRequestFilters,'page'|'sort'|'product'>&{cursor?:string};
export type CatalogWindowResponse=Omit<CatalogApiResponse,'apiVersion'|'pagination'>&{
 apiVersion:2;
 window:{pageSize:number;hasNext:boolean;hasPrevious:boolean;nextCursor:string|null;previousCursor:string|null};
};
export function buildCatalogWindowUrl(filters?:CatalogWindowFilters,baseUrl?:string):string;
export function buildCatalogueBrowseUrl(filters?:CatalogWindowFilters):string;
export function fetchCatalogWindow(filters?:CatalogWindowFilters,options?:{baseUrl?:string;fetchImpl?:typeof fetch;signal?:AbortSignal}):Promise<CatalogWindowResponse>;

export class CatalogClientError extends Error { status: number }
export function buildCatalogUrl(filters?: CatalogRequestFilters, baseUrl?: string): string;
export function buildProductsUrl(filters?: CatalogRequestFilters):string;
export function fetchCatalog(filters?: CatalogRequestFilters, options?: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<CatalogApiResponse>;
