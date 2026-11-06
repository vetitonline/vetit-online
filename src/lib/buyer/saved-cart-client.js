import { SavedCartError, cartId, normalizeSavedCart, normalizeCartItemInput, normalizeCartItemId } from './saved-cart-contract.js';

/** Browser cookies and native bearer sessions share one saved-cart contract. */
export async function requestSavedCart({ baseUrl, accessToken, command, profileId, signal, fetchImpl = fetch } = {}) {
  let origin;
  try {
    origin = new URL(baseUrl ?? globalThis.location?.origin);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error();
    if (accessToken !== undefined && (typeof accessToken !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) || accessToken.length > 8192)) throw Error();
  } catch { throw new SavedCartError('Saved cart API configuration is invalid.'); }
  let method = 'GET', body;
  if (command) {
    cartId(profileId);
    if (command.action === 'set') {
      body = normalizeCartItemInput(command.item);
      if (body.marketCode !== 'IN') throw new SavedCartError('Only the India cart is supported.');
      method = 'POST';
    } else if (command.action === 'remove') { body = { itemId: normalizeCartItemId(command) }; method = 'DELETE'; }
    else throw new SavedCartError('Cart action is invalid.');
  }
  let response;
  try {
    response = await fetchImpl(new URL('/api/buyer/cart', origin).toString(), {
      method, credentials: accessToken ? 'omit' : 'same-origin', redirect: 'error', cache: 'no-store', signal,
      headers: { accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(body ? { 'content-type': 'application/json', 'x-vetit-profile-id': profileId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new SavedCartError(command ? 'Cart change could not be confirmed. Reload before trying again.' : 'Saved cart could not be reached.', 0); }
  if (!response.ok) throw new SavedCartError(response.status === 401 ? 'Sign in to view your saved cart.' : response.status === 409 ? 'Your account changed. Reload before editing.' : response.status === 422 ? 'This product or option cannot be saved right now. Reload to check your cart.' : 'Saved cart is unavailable. Reload before trying again.', response.status);
  try {
    const result = await response.json();
    if (!command) {
      const cart = normalizeSavedCart(result);
      if (cart.marketCode !== 'IN' || cart.cart && cart.cart.currency_code !== 'INR') throw Error();
      return cart;
    }
    if (result.apiVersion !== 1 || result.state !== (method === 'POST' ? 'saved' : 'deleted')) throw Error();
    if (method === 'POST') cartId(result.cartItemId);
    return result;
  } catch { throw new SavedCartError('Saved cart returned an invalid response. Reload before trying again.', 503); }
}
