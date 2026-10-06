import type { FeaturedProduct } from './featured-products';
import { allCategories, findAnimal, findCategory, matchesProductTerms, PRODUCT_ANIMALS } from './product-taxonomy';

export type CatalogFilters = {
  query?: string;
  animal?: string;
  category?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string;
};

function searchableText(product: FeaturedProduct): string {
  return `${product.title} ${product.description} ${product.category} ${product.brand ?? ''} ${product.sellerName}`;
}

export function filterMarketplaceProducts(products: FeaturedProduct[], filters: CatalogFilters): FeaturedProduct[] {
  const animal = findAnimal(filters.animal ?? '');
  const category = animal && filters.category ? findCategory(animal, filters.category) : undefined;
  const categoryTerms = category
    ? [...category.terms, ...(category.children ?? []).flatMap((child) => child.terms)]
    : [];
  const query = filters.query?.trim().toLocaleLowerCase();

  const filtered = products.filter((product) => {
    const text = searchableText(product);
    if (query && !text.toLocaleLowerCase().includes(query)) return false;
    if (animal && !matchesProductTerms(text, animal.terms)) return false;
    if (filters.category && !category) return false;
    if (category && !matchesProductTerms(text, categoryTerms)) return false;
    if (filters.minPrice !== null && filters.minPrice !== undefined && (product.pricePaise === null || product.pricePaise < filters.minPrice)) return false;
    if (filters.maxPrice !== null && filters.maxPrice !== undefined && (product.pricePaise === null || product.pricePaise > filters.maxPrice)) return false;
    return true;
  });

  if (filters.sort === 'price-asc') filtered.sort((a, b) => (a.pricePaise ?? Number.MAX_SAFE_INTEGER) - (b.pricePaise ?? Number.MAX_SAFE_INTEGER));
  else if (filters.sort === 'price-desc') filtered.sort((a, b) => (b.pricePaise ?? -1) - (a.pricePaise ?? -1));
  else if (filters.sort === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title));
  return filtered;
}

export function getAllCategorySlugs(): string[] {
  return PRODUCT_ANIMALS.flatMap((animal) => allCategories(animal).map((category) => category.slug));
}
