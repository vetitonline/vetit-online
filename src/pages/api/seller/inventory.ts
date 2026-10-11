import type { APIRoute } from 'astro';
import type { InventoryAdjustmentInput } from '../../../lib/buyer/validation.js';
import { BuyerInputError, normalizeInventoryAdjustmentInput } from '../../../lib/buyer/validation.js';
import { readJsonBody } from '../../../lib/api/json-body.js';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { isSameOriginMutation } from '../../../lib/api/request-security.js';

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const { supabase } = auth;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ state: 'invalid_request' }, body.status);
  try {
    const input: InventoryAdjustmentInput = normalizeInventoryAdjustmentInput(body.value);
    const { data, error } = await callProposedCommerceRpc(supabase, 'set_seller_inventory', {
      p_business_id: input.businessId,
      p_product_variant_id: input.productVariantId,
      p_quantity_on_hand: input.quantityOnHand,
      p_stock_location: input.stockLocation,
    });
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === '22023' || error.code === '23514' ? 422 : 503;
      return json({ state: status === 503 ? 'unavailable' : 'invalid_request', message: 'Inventory was not changed.' }, status);
    }
    return json({ state: 'saved', inventoryLevelId: data });
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable' }, 503);
  }
};
