import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogProducts, paginateCatalogItems, parseCatalogParams } from '../src/lib/marketplace/catalog-contract.js';

const taxonomy = {
  animals: [
    { id: 'dog-id', slug: 'dogs', label: 'Dogs' },
    { id: 'cat-id', slug: 'cats', label: 'Cats' },
  ],
  categories: [
    { id: 'food', slug: 'pet-food', label: 'Pet Food', parentId: null, sortOrder: 1, species: ['dog-id', 'cat-id'] },
    { id: 'dog-food', slug: 'dog-food', label: 'Dog Food', parentId: 'food', sortOrder: 2, species: ['dog-id'] },
    { id: 'toys', slug: 'toys', label: 'Toys', parentId: null, sortOrder: 3, species: ['dog-id', 'cat-id'] },
  ],
};

const products = [
  { id: '1', title: 'Daily Dog Kibble', description: 'Dry food', category: 'Dog Food', categoryId: 'dog-food', sellerName: 'Farm Seller', species: ['dogs'], priceMinor: 49900 },
  { id: '2', title: 'Cat Play Ball', description: 'Toys', category: 'Toys', categoryId: 'toys', sellerName: 'Pet Seller', species: ['cats'], priceMinor: 12000 },
  { id: '3', title: 'Premium Dog Meal', description: 'Food', category: 'Dog Food', categoryId: 'dog-food', sellerName: 'Vet Shop', species: ['dogs'], priceMinor: null },
];

test('catalog contract resolves species/category slugs to descendant IDs and INR minor units', () => {
  const parsed = parseCatalogParams(new URLSearchParams('q= kibble &animal=dogs&category=pet-food&min=100&max=900&sort=price-asc&page=2&pageSize=48'), taxonomy);
  assert.equal(parsed.invalid, false);
  assert.equal(parsed.query, 'kibble');
  assert.equal(parsed.animal.id, 'dog-id');
  assert.deepEqual(parsed.categoryIds, ['food', 'dog-food']);
  assert.equal(parsed.minPrice, 10000);
  assert.equal(parsed.maxPrice, 90000);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 48);
});

test('catalog contract rejects unknown or incompatible filters and invalid price ranges', () => {
  assert.equal(parseCatalogParams(new URLSearchParams('animal=unknown'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('animal=cats&category=dog-food'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('min=900&max=100'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('sort=sql&page=0'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('min=not-a-price'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('pageSize=0'), taxonomy).invalid, true);
  assert.equal(parseCatalogParams(new URLSearchParams('product=not a product'), taxonomy).invalid, true);
});

test('shared filtering searches listing text, applies species and descendant category filters, and sorts prices', () => {
  const filters = parseCatalogParams(new URLSearchParams('animal=dogs&category=pet-food&sort=price-asc'), taxonomy);
  assert.deepEqual(filterCatalogProducts(products, filters).map(item => item.id), ['1', '3']);
  assert.deepEqual(filterCatalogProducts(products, { query: 'farm seller' }).map(item => item.id), ['1']);
  assert.deepEqual(filterCatalogProducts(products, { maxPrice: 20000 }).map(item => item.id), ['2']);
  assert.deepEqual(filterCatalogProducts(products, { sort: 'price-desc' }).map(item => item.id), ['1', '2', '3']);
  assert.deepEqual(filterCatalogProducts(products, { sort: 'name' }).map(item => item.title), ['Cat Play Ball', 'Daily Dog Kibble', 'Premium Dog Meal']);
  assert.deepEqual(filterCatalogProducts(products, { query: 'no matching listing' }), []);
});

test('pagination returns bounded slices and stable navigation metadata', () => {
  const result = paginateCatalogItems(products, 2, 2);
  assert.deepEqual(result.items.map(item => item.id), ['3']);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 2, total: 3, pageCount: 2, hasPrevious: true, hasNext: false });
  assert.equal(paginateCatalogItems([], 1, 24).pagination.pageCount, 1);
  assert.deepEqual(paginateCatalogItems([], 1, 24).items, []);
});
