import type { CatalogFilters } from './catalog-contract.js';
import { filterCatalogProducts } from './catalog-contract.js';
import type { FeaturedProduct } from './featured-products';

export type { CatalogFilters } from './catalog-contract.js';

/** Compatibility wrapper; browse routes and the shared REST API use the same implementation. */
export function filterMarketplaceProducts(products: FeaturedProduct[], filters: CatalogFilters): FeaturedProduct[] {
  return filterCatalogProducts(products, filters);
}
