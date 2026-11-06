import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuoteLines, CheckoutQuoteError } from '../src/lib/commerce/checkout-quote.js';

const lower = 'abcdefab-1234-4abc-8def-abcdefabcdef';
const upper = lower.toUpperCase();

test('mixed-case UUIDs identify one listing and combine quantities', () => {
  assert.deepEqual(normalizeQuoteLines({ lines: [
    { listingId: upper, quantity: 2 },
    { listingId: lower, quantity: 3 },
  ] }), [{ listingId: lower, quantity: 5 }]);
});

test('mixed-case duplicate listing IDs cannot bypass the 99-unit cap', () => {
  assert.throws(
    () => normalizeQuoteLines({ lines: [
      { listingId: lower, quantity: 60 },
      { listingId: upper, quantity: 40 },
    ] }),
    error => error instanceof CheckoutQuoteError && error.code === 'invalid_quantity',
  );
});

test('quote normalization discards client-supplied prices and seller metadata', () => {
  assert.deepEqual(normalizeQuoteLines({ lines: [
    { listingId: upper, quantity: 1, priceMinor: 1, sellerName: 'spoofed' },
  ] }), [{ listingId: lower, quantity: 1 }]);
});
