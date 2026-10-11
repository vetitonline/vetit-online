import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCheckoutQuote, CheckoutQuoteError, MAX_QUOTE_LINES, normalizeQuoteLines } from '../src/lib/commerce/checkout-quote.js';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const products = [
  { id: id1, title: 'Vetit Test Dog Food', category: 'Dog Food', sellerName: 'Vetit Test Seller', priceMinor: 49900, priceIsFrom: false, currencyCode: 'INR' },
  { id: id2, title: 'Vetit Test Cat Food', category: 'Cat Food', sellerName: 'Vetit Test Seller', priceMinor: 39900, priceIsFrom: false, currencyCode: 'INR' },
];

test('quote input ignores client price and authority fields and combines duplicate listing quantities', () => {
  assert.deepEqual(normalizeQuoteLines({ lines: [
    { listingId: id1, quantity: 2, priceMinor: 1, sellerId: 'attacker', paymentStatus: 'paid' },
    { listingId: id1, quantity: 3, unitAmountMinor: 0 },
  ], totalMinor: 0 }), [{ listingId: id1, quantity: 5 }]);
});

test('quote input enforces UUIDs, line count and bounded positive integer quantities', () => {
  for (const input of [
    null,
    { lines: [] },
    { lines: Array.from({ length: MAX_QUOTE_LINES + 1 }, () => ({ listingId: id1, quantity: 1 })) },
    { lines: [{ listingId: 'not-a-uuid', quantity: 1 }] },
    { lines: [{ listingId: id1, quantity: 0 }] },
    { lines: [{ listingId: id1, quantity: 1.5 }] },
    { lines: [{ listingId: id1, quantity: 99 }, { listingId: id1, quantity: 1 }] },
  ]) assert.throws(() => normalizeQuoteLines(input), CheckoutQuoteError);
});

test('quote calculation uses only current catalogue INR minor-unit prices', () => {
  const lines = normalizeQuoteLines({ lines: [{ listingId: id1, quantity: 2 }, { listingId: id2, quantity: 1 }] });
  const quote = calculateCheckoutQuote(lines, products);
  assert.equal(quote.subtotalMinor, 139700);
  assert.equal(quote.lines[0].unitAmountMinor, 49900);
  assert.equal(quote.currencyCode, 'INR');
  assert.equal(quote.deliveryMinor, null);
  assert.equal(quote.totalMinor, null);
  assert.equal(quote.checkoutEnabled, false);
});

test('quote rejects unavailable products, variant-only prices and non-INR catalogue rows', () => {
  const line = [{ listingId: id1, quantity: 1 }];
  assert.throws(() => calculateCheckoutQuote(line, []), (error) => error.code === 'listing_unavailable');
  assert.throws(() => calculateCheckoutQuote(line, [{ ...products[0], priceIsFrom: true }]), (error) => error.code === 'price_unavailable');
  assert.throws(() => calculateCheckoutQuote(line, [{ ...products[0], currencyCode: 'USD' }]), (error) => error.code === 'market_unavailable');
});

test('quote rejects unsafe integer arithmetic', () => {
  assert.throws(() => calculateCheckoutQuote([{ listingId: id1, quantity: 2 }], [
    { ...products[0], priceMinor: Number.MAX_SAFE_INTEGER },
  ]), (error) => error.code === 'amount_out_of_range');
});
