import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { getSupabasePublicConfig } from '../../lib/supabase/config';
import { authenticateApiRequest } from '../../lib/supabase/api-auth';
import { isSameOriginMutation } from '../../lib/api/request-security.js';
import { readJsonBody } from '../../lib/api/json-body.js';
import { AppointmentLifecycleError, appointmentId, normalizeAppointmentCommand } from '../../lib/services/appointment-lifecycle.js';
import { appointmentRpcStatus, callAppointmentLifecycle } from '../../lib/services/appointment-lifecycle-api';
const json = (state: string, status: number, data?: unknown) => new Response(JSON.stringify({ apiVersion: 1, state, ...(data ? { data } : {}) }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
export const prerender = false;
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const service = url.searchParams.get('serviceListingId');
  if (service !== null) {
    try {
      const serviceId = appointmentId(service);
      const config = getSupabasePublicConfig();
      if (!config) return json('unavailable', 503);
      const client = createClient<Database>(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const result = await callAppointmentLifecycle(client, 'appointment_lifecycle_policy', { p_service_listing_id: serviceId });
      if (result.error) return json('unavailable', appointmentRpcStatus(result.error.code));
      if (!result.data) return json('unavailable', 503);
      return json('available', 200, result.data);
    } catch (error) { return json('invalid_request', error instanceof AppointmentLifecycleError ? error.status : 503); }
  }
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state !== 'authenticated') return json(auth.state === 'unavailable' ? 'unavailable' : 'unauthorized', auth.state === 'unavailable' ? 503 : 401);
  try {
    const business = url.searchParams.get('businessId');
    const result = await callAppointmentLifecycle(auth.supabase, 'appointment_lifecycle_dashboard', { p_business_id: business ? appointmentId(business) : null });
    if (result.error) return json('unavailable', appointmentRpcStatus(result.error.code));
    if (!result.data) return json('unavailable', 503);
    return json('available', 200, result.data);
  } catch (error) { return json('unavailable', error instanceof AppointmentLifecycleError ? error.status : 503); }
};
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) return json('forbidden', 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json('invalid_request', 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state !== 'authenticated') return json(auth.state === 'unavailable' ? 'unavailable' : 'unauthorized', auth.state === 'unavailable' ? 503 : 401);
  const body = await readJsonBody(request, 8192);
  if (!body.ok) return json('invalid_request', body.status);
  try {
    const command = normalizeAppointmentCommand(body.value);
    const result = await callAppointmentLifecycle(auth.supabase, 'appointment_lifecycle_command', { p_command: command });
    if (result.error) return json('unavailable', appointmentRpcStatus(result.error.code));
    if (!result.data) return json('unavailable', 503);
    return json('accepted', 200, result.data);
  } catch (error) { return json('invalid_request', error instanceof AppointmentLifecycleError ? error.status : 503); }
};
