import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody } from '../src/lib/api/json-body.js';
import {
  BuyerInputError,
  normalizeAddressId,
  normalizeAddressInput,
  normalizeAppointmentBookingInput,
  normalizeCartItemId,
  normalizeCartItemInput,
  normalizeFulfilmentTransitionInput,
  normalizeInventoryAdjustmentInput,
} from '../src/lib/buyer/validation.js';
import { parseBearerAccessToken } from '../src/lib/supabase/auth-token.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';

test('address normalization trims fields and never accepts a client profile owner', () => {
  const address = normalizeAddressInput({
    recipientName: '  Priya Rao  ', addressLine1: '  5 Lake Road  ', city: ' Pune ', countryCode: 'in',
    profileId: 'attacker-profile', isDefault: true,
  });
  assert.equal(address.recipientName, 'Priya Rao');
  assert.equal(address.addressLine1, '5 Lake Road');
  assert.equal(address.countryCode, 'IN');
  assert.equal(address.isDefault, true);
  assert.equal('profileId' in address, false);
});

test('address validation rejects missing shipping fields, invalid country and out-of-range coordinates', () => {
  assert.throws(() => normalizeAddressInput({ recipientName: 'A', city: 'Pune', countryCode: 'IN' }), BuyerInputError);
  assert.throws(() => normalizeAddressInput({ recipientName: 'A', addressLine1: 'Road', city: 'Pune', countryCode: 'India' }), BuyerInputError);
  assert.throws(() => normalizeAddressInput({ recipientName: 'A', addressLine1: 'Road', city: 'Pune', countryCode: 'IN', latitude: 92 }), BuyerInputError);
  assert.throws(() => normalizeAddressId('not-an-id'), BuyerInputError);
});

test('cart validation bounds quantities and excludes client cart, owner, price and payment fields', () => {
  const input = normalizeCartItemInput({
    listingId, productVariantId: variantId, quantity: 3, marketCode: 'in',
    cartId: 'other-cart', profileId: 'other-buyer', unitPriceMinor: 1, paymentStatus: 'captured',
  });
  assert.deepEqual(input, { listingId, productVariantId: variantId, quantity: 3, marketCode: 'IN' });
  for (const bad of [
    { listingId, quantity: 0 }, { listingId, quantity: 100 }, { listingId: 'bad', quantity: 1 },
    { listingId, quantity: 1, productVariantId: 'bad' }, { listingId, quantity: 1, marketCode: 'IND' },
  ]) assert.throws(() => normalizeCartItemInput(bad), BuyerInputError);
  assert.throws(() => normalizeCartItemId({ itemId: 'bad' }), BuyerInputError);
});

test('inventory adjustments accept only bounded absolute quantities and valid identifiers', () => {
  assert.deepEqual(normalizeInventoryAdjustmentInput({ businessId, productVariantId: variantId, quantityOnHand: 8 }), {
    businessId, productVariantId: variantId, quantityOnHand: 8, stockLocation: null,
  });
  assert.throws(() => normalizeInventoryAdjustmentInput({ businessId, productVariantId: variantId, quantityOnHand: -1 }), BuyerInputError);
  assert.throws(() => normalizeInventoryAdjustmentInput({ businessId: 'bad', productVariantId: variantId, quantityOnHand: 8 }), BuyerInputError);
});

test('fulfilment validation requires tracking data before shipment', () => {
  assert.deepEqual(normalizeFulfilmentTransitionInput({ fulfilmentId: listingId, nextStatus: 'shipped', carrier: '  Carrier  ', trackingReference: ' T-1 ' }), {
    fulfilmentId: listingId, nextStatus: 'shipped', carrier: 'Carrier', trackingReference: 'T-1',
  });
  assert.throws(() => normalizeFulfilmentTransitionInput({ fulfilmentId: listingId, nextStatus: 'shipped' }), BuyerInputError);
  assert.throws(() => normalizeFulfilmentTransitionInput({ fulfilmentId: listingId, nextStatus: 'captured' }), BuyerInputError);
});

test('appointment booking accepts only an existing slot identifier and supported market code', () => {
  assert.deepEqual(normalizeAppointmentBookingInput({ appointmentSlotId: listingId, marketCode: 'in', priceMinor: 1, customerProfileId: 'attacker' }), {
    appointmentSlotId: listingId, marketCode: 'IN',
  });
  assert.deepEqual(normalizeAppointmentBookingInput({ appointmentSlotId: listingId }), { appointmentSlotId: listingId, marketCode: 'IN' });
  assert.throws(() => normalizeAppointmentBookingInput({ appointmentSlotId: 'bad' }), BuyerInputError);
  assert.throws(() => normalizeAppointmentBookingInput({ appointmentSlotId: listingId, marketCode: 'India' }), BuyerInputError);
});

test('request JSON reader rejects malformed and oversized bodies without parsing unbounded content', async () => {
  const valid = await readJsonBody(new Request('https://vetit.test/api', { method: 'POST', body: '{"ok":true}' }));
  assert.deepEqual(valid, { ok: true, value: { ok: true } });
  const malformed = await readJsonBody(new Request('https://vetit.test/api', { method: 'POST', body: '{bad' }));
  assert.deepEqual(malformed, { ok: false, status: 400 });
  const oversized = await readJsonBody(new Request('https://vetit.test/api', { method: 'POST', body: 'x'.repeat(50) }), 16);
  assert.deepEqual(oversized, { ok: false, status: 413 });
});

test('mobile bearer parsing accepts bounded JWT syntax and rejects malformed authorization headers', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature_part';
  assert.equal(parseBearerAccessToken(`Bearer ${jwt}`), jwt);
  assert.equal(parseBearerAccessToken('Basic invalid'), null);
  assert.equal(parseBearerAccessToken('Bearer not-a-jwt'), null);
  assert.equal(parseBearerAccessToken(`Bearer ${jwt}`.repeat(1000)), null);
});
