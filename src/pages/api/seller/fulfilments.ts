import type { APIRoute } from 'astro';
import type { FulfilmentTransitionInput } from '../../../lib/buyer/validation.js';
import { BuyerInputError, normalizeFulfilmentTransitionInput } from '../../../lib/buyer/validation.js';
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
    const input: FulfilmentTransitionInput = normalizeFulfilmentTransitionInput(body.value);
    const { data, error } = await callProposedCommerceRpc(supabase, 'advance_seller_fulfilment', {
      p_fulfilment_id: input.fulfilmentId,
      p_next_status: input.nextStatus,
      p_carrier: input.carrier,
      p_tracking_reference: input.trackingReference,
    });
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' || error.code === '23514' ? 422 : 503;
      return json({ state: status === 503 ? 'unavailable' : 'invalid_request', message: 'Fulfilment was not changed.' }, status);
    }
    return json({ state: 'updated', fulfilmentId: data });
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable' }, 503);
  }
};
