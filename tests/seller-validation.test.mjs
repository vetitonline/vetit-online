import test from 'node:test';
import assert from 'node:assert/strict';
import { isCanonicalSellerImagePath, normalizeSellerSku, sellerBusinessInput, sellerImageExtension, sellerProductInput, slugifySellerProduct } from '../src/lib/seller/validation.js';
import { canEditSellerProduct, canManageSellerBusiness, canManageSellerImage, canSellerTransitionListing } from '../src/lib/seller/permissions.js';

const categoryId = '22a722a7-1111-4111-8111-111111111111';
const dogId = 'ddab0000-1111-4111-8111-111111111111';
const catId = 'ccab0000-1111-4111-8111-111111111111';

function productForm(overrides = {}) {
  const form = new FormData();
  const values = { title: 'Farm Fresh Food', description: 'Fresh feed', category_id: categoryId, species_ids: dogId, base_amount_minor: '499', ...overrides };
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(item => form.append(key, item));
    else if (value !== null && value !== undefined) form.append(key, value);
  }
  return form;
}

test('seller business profile trims fields and rejects unsafe URL schemes', () => {
  const form = new FormData();
  form.set('display_name', '  Vetit Seller  ');
  form.set('legal_name', 'Vetit Seller Private Limited');
  form.set('business_type', 'farm');
  form.set('website_url', 'https://example.test');
  assert.deepEqual(sellerBusinessInput(form), {
    displayName: 'Vetit Seller', legalName: 'Vetit Seller Private Limited', businessType: 'farm', publicEmail: null,
    publicPhone: null, websiteUrl: 'https://example.test',
  });
  form.set('website_url', 'javascript:alert(1)');
  assert.throws(() => sellerBusinessInput(form), /HTTPS or HTTP/);
});

test('seller product prices convert whole INR rupees into paise', () => {
  const input = sellerProductInput(productForm(), new Map([[categoryId, new Set([dogId])]]));
  assert.equal(input.baseAmountMinor, 49900);
  assert.equal(input.slug, 'farm-fresh-food');
});

test('seller product rejects a species not linked to the selected category', () => {
  assert.throws(
    () => sellerProductInput(productForm({ species_ids: [dogId, catId] }), new Map([[categoryId, new Set([dogId])]])),
    /supported by this category/,
  );
});

test('seller product variants require a complete SKU, option and INR price', () => {
  const form = productForm({ base_amount_minor: '', variant_sku: ['FOOD-1KG'], variant_name: ['Weight'], variant_value: ['1 kg'], variant_amount_minor: ['499'] });
  const input = sellerProductInput(form, new Map([[categoryId, new Set([dogId])]]));
  assert.deepEqual(input.variants[0], { seller_sku: 'FOOD-1KG', option_attributes: { Weight: '1 kg' }, amount_minor: 49900 });
  form.set('variant_amount_minor', '4.99');
  assert.throws(() => sellerProductInput(form, new Map([[categoryId, new Set([dogId])]])), /whole INR/);
});

test('variant SKUs normalize consistently and normalized duplicates are rejected', () => {
  assert.equal(normalizeSellerSku(' sku  1 '), 'SKU-1');
  const form = productForm({ base_amount_minor: '', variant_sku: [' sku 1 ', 'SKU-1'], variant_name: ['Size', 'Size'], variant_value: ['1 kg', '2 kg'], variant_amount_minor: ['499', '799'] });
  assert.throws(() => sellerProductInput(form, new Map([[categoryId, new Set([dogId])]])), /unique after normalization/);
  const invalid = productForm({ base_amount_minor: '', variant_sku: ['bad/sku'], variant_name: ['Size'], variant_value: ['1 kg'], variant_amount_minor: ['499'] });
  assert.throws(() => sellerProductInput(invalid, new Map([[categoryId, new Set([dogId])]])), /letters, numbers/);
});

test('seller product requires a price and clean URL-safe slug', () => {
  assert.throws(() => sellerProductInput(productForm({ base_amount_minor: '' }), new Map([[categoryId, new Set([dogId])]])), /INR price/);
  assert.equal(slugifySellerProduct('  Cattle Feed & Nutrition  '), 'cattle-feed-nutrition');
});

test('seller operations require the signed-in user to hold an active role in that exact business', () => {
  const membership = { profile_id: 'user-a', business_id: 'business-a', membership_status: 'active', member_role: 'catalog_manager' };
  assert.equal(canManageSellerBusiness(membership, 'user-a', 'business-a'), true);
  assert.equal(canManageSellerBusiness(membership, 'user-b', 'business-a'), false);
  assert.equal(canManageSellerBusiness(membership, 'user-a', 'business-b'), false);
  assert.equal(canManageSellerBusiness({ ...membership, membership_status: 'suspended' }, 'user-a', 'business-a'), false);
  assert.equal(canManageSellerBusiness({ ...membership, member_role: 'fulfillment_manager' }, 'user-a', 'business-a'), false);
});

test('seller image access is scoped to an active catalog member, own business and editable product', () => {
  const membership = { profile_id: 'user-a', business_id: 'business-a', membership_status: 'active', member_role: 'catalog_manager' };
  assert.equal(canManageSellerImage(membership, 'user-a', 'business-a', 'business-a', 'draft'), true);
  assert.equal(canManageSellerImage(membership, 'user-b', 'business-a', 'business-a', 'draft'), false);
  assert.equal(canManageSellerImage(membership, 'user-a', 'business-a', 'business-b', 'draft'), false);
  assert.equal(canManageSellerImage(membership, 'user-a', 'business-a', 'business-a', 'published'), false);
});

test('seller image path accepts only the canonical seller/listing/UUID filename form', () => {
  const businessId = 'bbab0000-1111-4111-8111-111111111111';
  const listingId = '11ab0000-1111-4111-8111-111111111111';
  const valid = `${businessId}/${listingId}/12345678-1234-4234-8234-123456789abc.webp`;
  assert.equal(isCanonicalSellerImagePath(valid, businessId, listingId), true);
  assert.equal(isCanonicalSellerImagePath(`${businessId}/${listingId}/../photo.webp`, businessId, listingId), false);
  assert.equal(isCanonicalSellerImagePath(`${businessId}/other/12345678-1234-4234-8234-123456789abc.webp`, businessId, listingId), false);
  assert.equal(sellerImageExtension('image/png'), 'png');
  assert.equal(sellerImageExtension('image/svg+xml'), null);
});

test('seller product permissions allow draft editing and review submission but never publication', () => {
  assert.equal(canEditSellerProduct('draft'), true);
  assert.equal(canEditSellerProduct('rejected'), true);
  assert.equal(canEditSellerProduct('submitted'), false);
  assert.equal(canEditSellerProduct('published'), false);
  assert.equal(canSellerTransitionListing('draft', 'submitted'), true);
  assert.equal(canSellerTransitionListing('rejected', 'submitted'), true);
  assert.equal(canSellerTransitionListing('draft', 'published'), false);
  assert.equal(canSellerTransitionListing('published', 'submitted'), false);
});
