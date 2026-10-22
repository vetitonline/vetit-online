/** @typedef {{ id: string, slug: string, label: string, parentId: string | null, species: string[] }} CatalogCategory */
/** @typedef {{ id: string, slug: string, label: string }} CatalogAnimal */
import {categoriesForSpecies} from './category-navigation.js';

export const CATALOG_API_VERSION = 1;
export const CATALOG_DEFAULT_PAGE_SIZE = 24;
export const CATALOG_MAX_PAGE_SIZE = 48;

function descendants(categories, categoryId) {
  const ids = new Set([categoryId]);
  let frontier = [categoryId];
  while (frontier.length) {
    const next = categories.filter(item => item.parentId && frontier.includes(item.parentId))
      .map(item => item.id).filter(id => !ids.has(id));
    next.forEach(id => ids.add(id));
    frontier = next;
  }
  return [...ids];
}

/** Parse public catalogue filters into stable IDs shared by web and mobile clients. */
export function parseCatalogParams(params, taxonomy) {
  const rawQuery = (params.get('q') || '').trim();
  const animalSlug = (params.get('animal') || '').trim();
  const categorySlug = (params.get('category') || '').trim();
  const productKey = (params.get('product') || '').trim();
  const animal = animalSlug ? taxonomy.animals.find(item => item.slug === animalSlug)
    ?? (animalSlug === 'livestock' ? taxonomy.animals.find(item => item.slug === 'cattle') : undefined) : undefined;
  const category = categorySlug ? taxonomy.categories.find(item => item.slug === categorySlug) : undefined;
  const minRaw = params.get('min');
  const maxRaw = params.get('max');
  const toMinor = value => {
    if (value === null || value.trim() === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER / 100
      ? Math.round(amount * 100) : Number.NaN;
  };
  const minPrice = toMinor(minRaw);
  const maxPrice = toMinor(maxRaw);
  const requestedPage = Number(params.get('page') || '1');
  const requestedSize = Number(params.get('pageSize') || String(CATALOG_DEFAULT_PAGE_SIZE));
  const requestedSort = params.get('sort') || 'newest';
  const validSorts = new Set(['newest', 'price-asc', 'price-desc', 'name']);
  const categoryMatchesAnimal = !animal || !category || categoriesForSpecies(taxonomy.categories, animal.id).some(item => item.id === category.id);
  const invalid = Boolean((animalSlug && !animal) || (categorySlug && !category) || !categoryMatchesAnimal
    || (productKey && !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9][a-z0-9-]{0,149})$/i.test(productKey))
    || Number.isNaN(minPrice) || Number.isNaN(maxPrice)
    || (minPrice !== null && maxPrice !== null && minPrice > maxPrice)
    || !Number.isInteger(requestedPage) || requestedPage < 1
    || !Number.isInteger(requestedSize) || requestedSize < 1
    || !validSorts.has(requestedSort));

  return {
    invalid,
    query: rawQuery.slice(0, 100),
    animal,
    category,
    productKey: productKey || null,
    categoryIds: category ? descendants(taxonomy.categories, category.id) : undefined,
    minPrice: Number.isNaN(minPrice) ? null : minPrice,
    maxPrice: Number.isNaN(maxPrice) ? null : maxPrice,
    sort: validSorts.has(requestedSort) ? requestedSort : 'newest',
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1,
    pageSize: Number.isInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, CATALOG_MAX_PAGE_SIZE) : CATALOG_DEFAULT_PAGE_SIZE,
  };
}

/** Apply the same catalogue search and filter semantics on web and mobile. */
export function filterCatalogProducts(products, filters) {
  const query = filters.query?.trim().toLocaleLowerCase();
  const filtered = products.filter(product => {
    const searchable = `${product.title} ${product.description} ${product.category} ${product.sellerName}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (filters.animal && !product.species.includes(filters.animal.slug)) return false;
    if (filters.categoryIds?.length && !filters.categoryIds.includes(product.categoryId)) return false;
    if (!filters.categoryIds?.length && filters.category && product.categoryId !== filters.category.id) return false;
    if (filters.minPrice !== null && filters.minPrice !== undefined
      && (product.priceMinor === null || product.priceMinor < filters.minPrice)) return false;
    if (filters.maxPrice !== null && filters.maxPrice !== undefined
      && (product.priceMinor === null || product.priceMinor > filters.maxPrice)) return false;
    return true;
  });
  if (filters.sort === 'price-asc') filtered.sort((a, b) => (a.priceMinor ?? Number.MAX_SAFE_INTEGER) - (b.priceMinor ?? Number.MAX_SAFE_INTEGER));
  else if (filters.sort === 'price-desc') filtered.sort((a, b) => (b.priceMinor ?? -1) - (a.priceMinor ?? -1));
  else if (filters.sort === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title));
  return filtered;
}

export function paginateCatalogItems(items, page, pageSize) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: currentPage, pageSize, total, pageCount, hasPrevious: currentPage > 1, hasNext: currentPage < pageCount },
  };
}
