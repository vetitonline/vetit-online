import type { APIRoute } from 'astro';
import type { BuyerAddressInput } from '../../../lib/buyer/validation.js';
import { BuyerInputError, normalizeAddressId, normalizeAddressInput } from '../../../lib/buyer/validation.js';
import { readJsonBody } from '../../../lib/api/json-body.js';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { isSameOriginMutation } from '../../../lib/api/request-security.js';

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const addressArgs = (address: BuyerAddressInput) => ({
  p_address_id: address.id,
  p_label: address.label,
  p_recipient_name: address.recipientName,
  p_phone: address.phone,
  p_address_line1: address.addressLine1,
  p_address_line2: address.addressLine2,
  p_locality: address.locality,
  p_city: address.city,
  p_state_region: address.stateRegion,
  p_postal_code: address.postalCode,
  p_country_code: address.countryCode,
  p_latitude: address.latitude,
  p_longitude: address.longitude,
  p_is_default: address.isDefault,
});

export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const { supabase, user } = auth;
  const { data, error } = await supabase.from('addresses')
    .select('id,label,recipient_name,phone,address_line1,address_line2,locality,city,state_region,postal_code,country_code,latitude,longitude,is_default,created_at,updated_at')
    .eq('profile_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: false });
  if (error) return json({ state: 'unavailable', message: 'Saved addresses are temporarily unavailable.' }, 503);
  return json({ state: 'available', addresses: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const { supabase } = auth;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ state: 'invalid_request', message: body.status === 413 ? 'Request is too large.' : 'Address JSON is invalid.' }, body.status);
  try {
    const address = normalizeAddressInput(body.value);
    const { data, error } = await callProposedCommerceRpc(supabase, 'save_my_address', addressArgs(address));
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' ? 422 : 503;
      return json({ state: status === 503 ? 'unavailable' : 'invalid_request', message: status === 503 ? 'Address could not be saved.' : 'Address could not be saved.' }, status);
    }
    return json({ state: 'saved', addressId: data }, address.id ? 200 : 201);
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable', message: 'Address could not be saved.' }, 503);
  }
};

export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  if (!isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
  let id: string;
  try {
    id = normalizeAddressId(url.searchParams.get('id'));
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request' }, 400);
    return json({ state: 'invalid_request' }, 400);
  }
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const { supabase, user } = auth;
  const { data, error } = await supabase.from('addresses').delete().eq('id', id).eq('profile_id', user.id).select('id').maybeSingle();
  if (error) return json({ state: 'unavailable', message: 'Address could not be deleted.' }, 503);
  return data ? json({ state: 'deleted' }) : json({ state: 'not_found' }, 404);
};
