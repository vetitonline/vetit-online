const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BuyerInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BuyerInputError';
    this.code = code;
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new BuyerInputError('invalid_address', `${label} is required.`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new BuyerInputError('invalid_address', `${label} is invalid.`);
  return text;
}

function optionalText(value, label, maxLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new BuyerInputError('invalid_address', `${label} is invalid.`);
  return value.trim() || null;
}

export function normalizeAddressInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BuyerInputError('invalid_address', 'Address details are required.');
  const id = input.id == null || input.id === '' ? null : input.id;
  if (id !== null && (typeof id !== 'string' || !UUID.test(id))) throw new BuyerInputError('invalid_address', 'Address ID is invalid.');
  const countryCode = (typeof input.countryCode === 'string' ? input.countryCode.trim().toUpperCase() : 'IN');
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new BuyerInputError('invalid_address', 'Country code is invalid.');
  const latitude = input.latitude == null || input.latitude === '' ? null : Number(input.latitude);
  const longitude = input.longitude == null || input.longitude === '' ? null : Number(input.longitude);
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new BuyerInputError('invalid_address', 'Latitude is invalid.');
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new BuyerInputError('invalid_address', 'Longitude is invalid.');
  if (input.isDefault != null && typeof input.isDefault !== 'boolean') throw new BuyerInputError('invalid_address', 'Default address setting is invalid.');
  const postalCode = optionalText(input.postalCode, 'Postal code', 20);
  if (countryCode === 'IN' && postalCode && !/^\d{6}$/.test(postalCode)) throw new BuyerInputError('invalid_address', 'Indian PIN codes must contain six digits.');
  return {
    id,
    label: optionalText(input.label, 'Label', 40),
    recipientName: requiredText(input.recipientName, 'Recipient name', 120),
    phone: optionalText(input.phone, 'Phone', 32),
    addressLine1: requiredText(input.addressLine1, 'Address line 1', 200),
    addressLine2: optionalText(input.addressLine2, 'Address line 2', 200),
    locality: optionalText(input.locality, 'Locality', 120),
    city: requiredText(input.city, 'City', 120),
    stateRegion: optionalText(input.stateRegion, 'State or region', 120),
    postalCode,
    countryCode,
    latitude,
    longitude,
    isDefault: input.isDefault === true,
  };
}

export function normalizeCartItemInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.listingId !== 'string' || !UUID.test(input.listingId)
    || (input.productVariantId != null && (typeof input.productVariantId !== 'string' || !UUID.test(input.productVariantId)))
    || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new BuyerInputError('invalid_cart_item', 'Cart item details are invalid.');
  }
  const marketCode = input.marketCode == null ? 'IN' : typeof input.marketCode === 'string' ? input.marketCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(marketCode)) throw new BuyerInputError('invalid_market', 'Market code is invalid.');
  return { listingId: input.listingId, productVariantId: input.productVariantId ?? null, quantity: input.quantity, marketCode };
}

export function normalizeCartItemId(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.itemId !== 'string' || !UUID.test(input.itemId)) {
    throw new BuyerInputError('invalid_cart_item', 'Cart item ID is invalid.');
  }
  return input.itemId;
}

export function normalizeAddressId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BuyerInputError('invalid_address', 'Address ID is invalid.');
  return value;
}

export function normalizeInventoryAdjustmentInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.businessId !== 'string' || !UUID.test(input.businessId)
    || typeof input.productVariantId !== 'string' || !UUID.test(input.productVariantId)
    || !Number.isSafeInteger(input.quantityOnHand) || input.quantityOnHand < 0 || input.quantityOnHand > 10000000) {
    throw new BuyerInputError('invalid_inventory', 'Inventory adjustment is invalid.');
  }
  const stockLocation = optionalText(input.stockLocation, 'Stock location', 100);
  return { businessId: input.businessId, productVariantId: input.productVariantId, quantityOnHand: input.quantityOnHand, stockLocation };
}

export function normalizeFulfilmentTransitionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.fulfilmentId !== 'string' || !UUID.test(input.fulfilmentId)
    || !['packed', 'shipped', 'delivered', 'cancelled'].includes(input.nextStatus)) {
    throw new BuyerInputError('invalid_fulfilment', 'Fulfilment update is invalid.');
  }
  const carrier = optionalText(input.carrier, 'Carrier', 80);
  const trackingReference = optionalText(input.trackingReference, 'Tracking reference', 120);
  if (input.nextStatus === 'shipped' && (!carrier || !trackingReference)) throw new BuyerInputError('invalid_fulfilment', 'Carrier and tracking reference are required before shipping.');
  return { fulfilmentId: input.fulfilmentId, nextStatus: input.nextStatus, carrier, trackingReference };
}

export function normalizeAppointmentBookingInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.appointmentSlotId !== 'string' || !UUID.test(input.appointmentSlotId)) {
    throw new BuyerInputError('invalid_appointment', 'Appointment slot is invalid.');
  }
  const marketCode = input.marketCode == null ? 'IN' : typeof input.marketCode === 'string' ? input.marketCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(marketCode)) throw new BuyerInputError('invalid_market', 'Market code is invalid.');
  return { appointmentSlotId: input.appointmentSlotId, marketCode };
}
