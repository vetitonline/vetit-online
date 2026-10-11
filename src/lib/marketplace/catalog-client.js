import { CATALOG_API_VERSION } from './catalog-contract.js';

const allowedStates = new Set(['available', 'unconfigured', 'error', 'invalid_request']);

export class CatalogClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'CatalogClientError';
    this.status = status;
  }
}

/** Build the stable catalogue request URL used by web and native HTTP clients. */
export function buildCatalogUrl(filters = {}, baseUrl = '') {
  const params = new URLSearchParams();
  const fields = [
    ['q', filters.query], ['animal', filters.animal], ['category', filters.category],
    ['product', filters.product], ['min', filters.minPriceRupees], ['max', filters.maxPriceRupees],
    ['sort', filters.sort], ['page', filters.page], ['pageSize', filters.pageSize],
  ];
  for (const [key, value] of fields) {
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }

  const query = params.toString();
  if (!baseUrl) return `/api/catalog${query ? `?${query}` : ''}`;
  const url = new URL('/api/catalog', baseUrl);
  url.search = query;
  return url.toString();
}

function isCatalogResponse(value) {
  return value !== null && typeof value === 'object'
    && value.apiVersion === CATALOG_API_VERSION
    && allowedStates.has(value.state);
}

function isCatalogProduct(value) {
  return value !== null && typeof value === 'object'
    && typeof value.id === 'string' && typeof value.slug === 'string'
    && typeof value.title === 'string' && typeof value.description === 'string'
    && typeof value.category === 'string' && typeof value.categorySlug === 'string'
    && typeof value.categoryId === 'string' && typeof value.sellerName === 'string'
    && Array.isArray(value.species) && value.species.every((species) => typeof species === 'string')
    && (value.priceMinor === null || (Number.isSafeInteger(value.priceMinor) && value.priceMinor >= 0))
    && typeof value.priceIsFrom === 'boolean' && typeof value.currencyCode === 'string'
    && (value.imageUrl === null || typeof value.imageUrl === 'string')
    && (value.imageAlt === null || typeof value.imageAlt === 'string');
}

function isPagination(value) {
  return value !== null && typeof value === 'object'
    && Number.isInteger(value.page) && value.page > 0
    && Number.isInteger(value.pageSize) && value.pageSize > 0
    && Number.isInteger(value.total) && value.total >= 0
    && Number.isInteger(value.pageCount) && value.pageCount > 0
    && typeof value.hasPrevious === 'boolean' && typeof value.hasNext === 'boolean'
    && typeof value.truncated === 'boolean';
}

function isTaxonomy(value) {
  return value !== null && typeof value === 'object'
    && Array.isArray(value.animals) && value.animals.every((animal) => animal
      && typeof animal.id === 'string' && typeof animal.slug === 'string' && typeof animal.label === 'string')
    && Array.isArray(value.categories) && value.categories.every((category) => category
      && typeof category.id === 'string' && typeof category.slug === 'string'
      && typeof category.label === 'string' && (category.parentId === null || typeof category.parentId === 'string')
      && Array.isArray(category.species) && category.species.every((id) => typeof id === 'string'));
}

/** Fetch and validate the shared public catalogue response. No Supabase key is needed by clients. */
export async function fetchCatalog(filters = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new CatalogClientError('Fetch is unavailable in this client.');

  let response;
  try {
    response = await fetchImpl(buildCatalogUrl(filters, options.baseUrl ?? ''), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
  } catch {
    throw new CatalogClientError('The catalogue could not be reached.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CatalogClientError('The catalogue returned an unreadable response.', response.status);
  }
  if (!isCatalogResponse(payload)) {
    throw new CatalogClientError('The catalogue response version or format is unsupported.', response.status);
  }
  if (!response.ok || payload.state === 'error' || payload.state === 'invalid_request') {
    throw new CatalogClientError(payload.message || 'The catalogue request failed.', response.status);
  }
  if (payload.marketCode !== 'IN' || !Array.isArray(payload.products)
    || !payload.products.every(isCatalogProduct) || !isTaxonomy(payload.taxonomy)
    || !isPagination(payload.pagination)) {
    throw new CatalogClientError('The catalogue response is missing required data.', response.status);
  }
  return payload;
}
