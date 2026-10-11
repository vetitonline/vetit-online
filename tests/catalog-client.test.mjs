import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogUrl, CatalogClientError, fetchCatalog } from '../src/lib/marketplace/catalog-client.js';

const payload = {
  apiVersion: 1, state: 'available', marketCode: 'IN', products: [],
  pagination: { page: 1, pageSize: 24, total: 0, pageCount: 1, hasPrevious: false, hasNext: false, truncated: false },
  filters: { query: '', animal: null, category: null, product: null, minPriceMinor: null, maxPriceMinor: null, sort: 'newest' },
  taxonomy: { animals: [], categories: [] },
};

test('catalog URL builder matches the public API filter names and leaves unset values out', () => {
  assert.equal(buildCatalogUrl({ query: 'dog food', animal: 'dogs', minPriceRupees: 499, page: 2 }),
    '/api/catalog?q=dog+food&animal=dogs&min=499&page=2');
  assert.equal(buildCatalogUrl({}, 'https://vetit.online'), 'https://vetit.online/api/catalog');
});

test('catalog client sends a read-only request and accepts an empty result', async () => {
  let request;
  const result = await fetchCatalog({ category: 'dog-food' }, {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, json: async () => payload };
    },
  });
  assert.equal(request.url, '/api/catalog?category=dog-food');
  assert.equal(request.init.method, 'GET');
  assert.deepEqual(result.products, []);
  assert.equal(result.marketCode, 'IN');
});

test('catalog client surfaces invalid filters and unavailable API responses', async () => {
  for (const [status, body] of [
    [400, { apiVersion: 1, state: 'invalid_request', message: 'Invalid filters.' }],
    [503, { apiVersion: 1, state: 'error', message: 'Catalogue unavailable.' }],
  ]) {
    await assert.rejects(fetchCatalog({}, { fetchImpl: async () => ({ ok: false, status, json: async () => body }) }),
      (error) => error instanceof CatalogClientError && error.status === status);
  }
});

test('catalog client rejects incompatible API versions and malformed responses', async () => {
  await assert.rejects(fetchCatalog({}, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...payload, apiVersion: 2 }) }) }), CatalogClientError);
  await assert.rejects(fetchCatalog({}, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...payload, products: null }) }) }), CatalogClientError);
  await assert.rejects(fetchCatalog({}, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...payload, products: [{ title: 'untrusted incomplete payload' }] }) }) }), CatalogClientError);
  await assert.rejects(fetchCatalog({}, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...payload, pagination: { page: 0 } }) }) }), CatalogClientError);
});
