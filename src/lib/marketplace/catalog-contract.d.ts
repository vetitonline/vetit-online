import type { FeaturedProduct, ProductAnimal, ProductCategory } from './catalog-types.js';

export const CATALOG_API_VERSION: number;
export const CATALOG_DEFAULT_PAGE_SIZE: number;
export const CATALOG_MAX_PAGE_SIZE: number;

export type CatalogFilters = {
  query?: string;
  animal?: ProductAnimal;
  category?: ProductCategory;
  categoryIds?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string;
};

export type ParsedCatalogParams = Omit<CatalogFilters, 'query' | 'sort' | 'minPrice' | 'maxPrice'> & {
  invalid: boolean;
  query: string;
  sort: string;
  minPrice: number | null;
  maxPrice: number | null;
  productKey: string | null;
  page: number;
  pageSize: number;
};

export function parseCatalogParams(params: URLSearchParams, taxonomy: {
  animals: ProductAnimal[];
  categories: ProductCategory[];
}): ParsedCatalogParams;
export function filterCatalogProducts(products: FeaturedProduct[], filters: CatalogFilters): FeaturedProduct[];
export function paginateCatalogItems<T>(items: T[], page: number, pageSize: number): {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number; hasPrevious: boolean; hasNext: boolean };
};
