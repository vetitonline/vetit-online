import { BuyerInputError, normalizeCartItemInput, normalizeCartItemId } from './validation.js';
import { MAX_SAVED_CART_LINES, cartId, normalizeSavedCart } from './saved-cart-contract.js';
import { readJsonBody } from '../api/json-body.js';
import { isSameOriginMutation } from '../api/request-security.js';

const json = (body, status = 200) => new Response(JSON.stringify({ apiVersion: 1, ...body }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});
/** Existing scoped commerce RPCs only; no privileged client or database provisioning. */
export function createSavedCartHandler({ authenticate, rpc }) {
  return async ({ request, cookies, url = new URL(request.url) }) => {
    try {
      const writing = request.method !== 'GET';
      if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ state: 'method_not_allowed' }, 405);
      if (writing && !isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
      const auth = await authenticate(request, cookies);
      if (auth.state !== 'authenticated') return json({ state: auth.state === 'unavailable' ? 'unavailable' : 'unauthorized' }, auth.state === 'unavailable' ? 503 : 401);
      const { supabase, user } = auth;
      if (writing) {
        // Refuse stale forms after switching between customer accounts.
        if (request.headers.get('x-vetit-profile-id') !== user.id) return json({ state: 'session_changed' }, 409);
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
        const body = await readJsonBody(request, 2048);
        if (!body.ok) return json({ state: 'invalid_request' }, body.status);
        let name, args;
        if (request.method === 'POST') {
          const item = normalizeCartItemInput(body.value);
          name = 'set_my_cart_item';
          args = { p_listing_id: item.listingId, p_product_variant_id: item.productVariantId, p_quantity: item.quantity, p_market_code: item.marketCode };
        } else { name = 'remove_my_cart_item'; args = { p_cart_item_id: normalizeCartItemId(body.value) }; }
        const { data, error } = await rpc(supabase, name, args);
        if (error) return json({ state: 'unavailable', message: 'Cart change could not be confirmed. Reload before trying again.' }, error.code === '42501' ? 403 : error.code === '22023' ? 422 : 503);
        if (request.method === 'DELETE' && data === null) return json({ state: 'not_found' }, 404);
        cartId(data);
        return json(request.method === 'POST' ? { state: 'saved', cartItemId: data } : { state: 'deleted' });
      }
      const market = (url.searchParams.get('market') ?? 'IN').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(market)) return json({ state: 'invalid_request' }, 400);
      const { data: cart, error } = await supabase.from('carts').select('id,market_code,currency_code,status')
        .eq('profile_id', user.id).eq('market_code', market).eq('status', 'active').maybeSingle();
      if (error) throw error;
      if (!cart) return json(normalizeSavedCart({ apiVersion: 1, state: 'available', profileId: user.id, marketCode: market, cart: null, items: [] }));
      const result = await supabase.from('cart_items').select('id,listing_id,product_variant_id,quantity', { count: 'exact' })
        .eq('cart_id', cart.id).order('created_at').order('id').limit(MAX_SAVED_CART_LINES + 1);
      // Do not expose a silently truncated cart or let the user edit a partial view.
      if (result.error || !Array.isArray(result.data) || result.count !== result.data.length || result.data.length > MAX_SAVED_CART_LINES) throw Error();
      const ids = [...new Set(result.data.map(row => cartId(row.listing_id)))];
      const titles = ids.length ? await supabase.from('listings').select('id,title', { count: 'exact' }).in('id', ids).eq('kind', 'product').limit(MAX_SAVED_CART_LINES + 1) : { data: [], count: 0 };
      if (titles.error || !Array.isArray(titles.data) || titles.count !== titles.data.length) throw Error();
      const byId = new Map(titles.data.map(row => [row.id, row.title]));
      return json(normalizeSavedCart({ apiVersion: 1, state: 'available', profileId: user.id, marketCode: market, cart,
        items: result.data.map(row => ({ ...row, title: byId.get(row.listing_id) ?? null })) }));
    } catch (error) {
      if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
      return json({ state: 'unavailable', message: 'Saved cart is temporarily unavailable. Reload before trying again.' }, 503);
    }
  };
}
