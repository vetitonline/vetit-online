import type { APIRoute } from 'astro';
import { filterCatalogProducts, paginateCatalogItems, parseCatalogParams, CATALOG_API_VERSION } from '../../../lib/marketplace/catalog-contract.js';
import { getMarketplaceProducts, getProductTaxonomy } from '../../../lib/marketplace/featured-products';

export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=120' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

/** Read-only catalogue contract for Astro pages and future native mobile clients. */
export const GET: APIRoute = async ({ request, cookies }) => {
  const taxonomy = await getProductTaxonomy(request, cookies);
  if (taxonomy.state === 'error') {
    return json({ apiVersion: CATALOG_API_VERSION, state: 'error', message: 'Catalogue is temporarily unavailable.' }, 503);
  }

  const params = parseCatalogParams(new URL(request.url).searchParams, taxonomy);
  if (params.invalid) {
    return json({ apiVersion: CATALOG_API_VERSION, state: 'invalid_request', message: 'One or more catalogue filters are invalid.' }, 400);
  }

  const productIsUuid = params.productKey !== null
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.productKey);
  const result = await getMarketplaceProducts(request, cookies, params.productKey ? 1 : 1000, {
    marketCode: 'IN', taxonomy,
    ...(params.productKey ? productIsUuid ? { productId: params.productKey } : { productSlug: params.productKey } : {}),
  });
  if (result.state === 'error') {
    return json({ apiVersion: CATALOG_API_VERSION, state: 'error', message: 'Catalogue is temporarily unavailable.' }, 503);
  }
  const products = result.state === 'available'
    ? filterCatalogProducts(result.products, params)
    : [];
  const page = paginateCatalogItems(products, params.page, params.pageSize);

  return json({
    apiVersion: CATALOG_API_VERSION,
    state: result.state,
    marketCode: 'IN',
    products: page.items,
    pagination: { ...page.pagination, truncated: result.products.length >= 1000 },
    filters: {
      query: params.query,
      animal: params.animal?.slug ?? null,
      category: params.category?.slug ?? null,
      product: params.productKey,
      minPriceMinor: params.minPrice,
      maxPriceMinor: params.maxPrice,
      sort: params.sort,
    },
    taxonomy: { animals: taxonomy.animals, categories: taxonomy.categories },
  });
};
