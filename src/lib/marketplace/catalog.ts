import type { FeaturedProduct, ProductAnimal, ProductCategory } from "./featured-products";

export type CatalogFilters = {
  query?: string;
  animal?: ProductAnimal;
  category?: ProductCategory;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string;
};

function searchableText(product: FeaturedProduct): string {
  return `${product.title} ${product.description} ${product.category} ${product.sellerName}`;
}

export function filterMarketplaceProducts(products: FeaturedProduct[], filters: CatalogFilters): FeaturedProduct[] {
  const query = filters.query?.trim().toLocaleLowerCase();
  const filtered = products.filter((product) => {
    if (query && !searchableText(product).toLocaleLowerCase().includes(query)) return false;
    if (filters.animal && !product.species.includes(filters.animal.slug)) return false;
    if (filters.category && product.categoryId !== filters.category.id) return false;
    if (filters.minPrice !== null && filters.minPrice !== undefined && (product.priceMinor === null || product.priceMinor < filters.minPrice)) return false;
    if (filters.maxPrice !== null && filters.maxPrice !== undefined && (product.priceMinor === null || product.priceMinor > filters.maxPrice)) return false;
    return true;
  });
  if (filters.sort === "price-asc") filtered.sort((a, b) => (a.priceMinor ?? Number.MAX_SAFE_INTEGER) - (b.priceMinor ?? Number.MAX_SAFE_INTEGER));
  else if (filters.sort === "price-desc") filtered.sort((a, b) => (b.priceMinor ?? -1) - (a.priceMinor ?? -1));
  else if (filters.sort === "name") filtered.sort((a, b) => a.title.localeCompare(b.title));
  return filtered;
}
