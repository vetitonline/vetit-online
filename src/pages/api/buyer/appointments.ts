import type { APIRoute } from 'astro';
import type { AppointmentBookingInput } from '../../../lib/buyer/validation.js';
import { BuyerInputError, normalizeAppointmentBookingInput } from '../../../lib/buyer/validation.js';
import { readJsonBody } from '../../../lib/api/json-body.js';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const sameOrigin = (request: Request) => {
  if (request.headers.has('authorization')) return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ state: 'forbidden' }, 403);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
  const auth = await authenticateApiRequest(request, cookies);
  if (auth.state === 'unavailable') return json({ state: 'unavailable' }, 503);
  if (auth.state !== 'authenticated') return json({ state: 'unauthorized' }, 401);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ state: 'invalid_request', message: body.status === 413 ? 'Request is too large.' : 'Appointment JSON is invalid.' }, body.status);
  try {
    const input: AppointmentBookingInput = normalizeAppointmentBookingInput(body.value);
    const { data, error } = await callProposedCommerceRpc(auth.supabase, 'book_my_appointment', {
      p_appointment_slot_id: input.appointmentSlotId,
      p_market_code: input.marketCode,
    });
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404
        : error.code === '40001' || error.code === '23505' ? 409
          : error.code === '22023' ? 422 : 503;
      const state = status === 403 ? 'forbidden' : status === 404 ? 'not_found'
        : status === 409 ? 'conflict' : status === 422 ? 'invalid_request' : 'unavailable';
      return json({ state, message: 'Appointment could not be booked.' }, status);
    }
    return json({ state: 'accepted', bookingId: data });
  } catch (error) {
    if (error instanceof BuyerInputError) return json({ state: 'invalid_request', message: error.message }, 400);
    return json({ state: 'unavailable' }, 503);
  }
};
