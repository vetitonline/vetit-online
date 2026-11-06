import { normalizeCartItemInput, normalizeCartItemId } from './validation.js';
export { normalizeCartItemInput, normalizeCartItemId };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SAVED_CART_LINES = 200;
export class SavedCartError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function cartId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new SavedCartError('Cart identifier is invalid.');
  return value;
}
export function normalizeSavedCart(body) {
  if (body?.apiVersion !== 1 || body.state !== 'available' || typeof body.marketCode !== 'string' || !/^[A-Z]{2}$/.test(body.marketCode) || !Array.isArray(body.items) || body.items.length > MAX_SAVED_CART_LINES) throw new SavedCartError('Saved cart returned an invalid response.', 503);
  const profileId = cartId(body.profileId);
  const cart = body.cart;
  if (cart !== null && (!cart || cart.market_code !== body.marketCode || typeof cart.currency_code !== 'string' || !/^[A-Z]{3}$/.test(cart.currency_code) || cart.status !== 'active')) throw new SavedCartError('Saved cart returned an invalid response.', 503);
  if (cart !== null) cartId(cart.id);
  if (cart === null && body.items.length) throw new SavedCartError('Saved cart returned an invalid response.', 503);
  const seen = new Set();
  const products = new Set();
  const items = body.items.map(row => {
    const id = cartId(row?.id);
    let normalized;
    try {
      if (row.product_variant_id !== null) cartId(row.product_variant_id);
      normalized = normalizeCartItemInput({ listingId: row.listing_id, productVariantId: row.product_variant_id, quantity: row.quantity });
    } catch { throw new SavedCartError('Saved cart returned an invalid response.', 503); }
    const key = normalized.listingId + ':' + (normalized.productVariantId ?? '');
    if (seen.has(id) || products.has(key) || !(row.title === null || typeof row.title === 'string' && row.title.length <= 1000)) throw new SavedCartError('Saved cart returned an invalid response.', 503);
    seen.add(id); products.add(key);
    return { id, listing_id: normalized.listingId, product_variant_id: normalized.productVariantId, quantity: normalized.quantity, title: row.title };
  });
  return { apiVersion: 1, state: 'available', profileId, marketCode: body.marketCode, cart: cart === null ? null : { id: cart.id, market_code: cart.market_code, currency_code: cart.currency_code, status: 'active' }, items };
}
