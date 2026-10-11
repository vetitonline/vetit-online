import type { APIRoute } from 'astro';
import type { CartItemInput } from '../../../lib/buyer/validation.js';
import { BuyerInputError, normalizeCartItemId, normalizeCartItemInput } from '../../../lib/buyer/validation.js';
import { readJsonBody } from '../../../lib/api/json-body.js';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { isSameOriginMutation } from '../../../lib/api/request-security.js';

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const rpcError = (error: { code?: string }) => error.code === '42501' ? 403 : error.code === '22023' ? 422 : 503;

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const marketCode = (url.searchParams.get('market') ?? 'IN').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(marketCode)) return json({ state: 'invalid_request' }, 400);
  const { data: cart, error: cartError } = await auth.supabase.from('carts').select('id,market_code,currency_code,status')
    .eq('profile_id', auth.user.id).eq('market_code', marketCode).eq('status', 'active').maybeSingle();
  if (cartError) return json({ state: 'unavailable', message: 'Cart is temporarily unavailable.' }, 503);
  if (!cart) return json({ state: 'available', cart: null, items: [] });
  const { data: items, error: itemsError } = await auth.supabase.from('cart_items')
    .select('id,listing_id,product_variant_id,quantity,created_at,updated_at').eq('cart_id', cart.id).order('created_at');
  if (itemsError) return json({ state: 'unavailable', message: 'Cart is temporarily unavailable.' }, 503);
  return json({ state: 'available', cart, items: items ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ state: 'invalid_request', message: body.status === 413 ? 'Request is too large.' : 'Cart JSON is invalid.' }, body.status);
  try {
    const item: CartItemInput = normalizeCartItemInput(body.value);
    const { data, error } = await callProposedCommerceRpc(auth.supabase, 'set_my_cart_item', {
      p_listing_id: item.listingId,
      p_product_variant_id: item.productVariantId,
      p_quantity: item.quantity,
      p_market_code: item.marketCode,
    });
    if (error) {
      const status = rpcError(error);
      return json({ state: status === 503 ? 'unavailable' : 'invalid_request', message: 'Cart item could not be saved.' }, status);
    }
    return json({ state: 'saved', cartItemId: data });
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable' }, 503);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ state: 'invalid_request' }, body.status);
  try {
    const itemId = normalizeCartItemId(body.value);
    const { data, error } = await callProposedCommerceRpc(auth.supabase, 'remove_my_cart_item', { p_cart_item_id: itemId });
    if (error) {
      const status = rpcError(error);
      return json({ state: status === 503 ? 'unavailable' : 'invalid_request' }, status);
    }
    return data ? json({ state: 'deleted' }) : json({ state: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable' }, 503);
  }
};
