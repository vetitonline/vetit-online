import { createClient } from '@supabase/supabase-js';
import type { APIRoute } from 'astro';
import type { Database } from '../../../lib/supabase/database.types';
import {
  APPOINTMENT_SLOT_PAGE_LIMIT,
  APPOINTMENT_SLOTS_API_VERSION,
  AppointmentSlotQueryError,
  parseAppointmentSlotQuery,
} from '../../../lib/services/appointment-slots.js';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';

export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=30' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

/** Public, bounded availability read. RLS exposes only eligible future slots. */
export const GET: APIRoute = async ({ url }) => {
  let query;
  try {
    query = parseAppointmentSlotQuery(url.searchParams);
  } catch (error) {
    if (error instanceof AppointmentSlotQueryError) {
      return json({ apiVersion: APPOINTMENT_SLOTS_API_VERSION, state: 'invalid_request', message: error.message }, 400);
    }
    return json({ apiVersion: APPOINTMENT_SLOTS_API_VERSION, state: 'unavailable' }, 503);
  }

  const config = getSupabasePublicConfig();
  if (!config) return json({ apiVersion: APPOINTMENT_SLOTS_API_VERSION, state: 'unavailable' }, 503);
  try {
    const supabase = createClient<Database>(config.url, config.publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.from('appointment_slots')
      .select('id,service_listing_id,starts_at,ends_at')
      .eq('service_listing_id', query.serviceListingId)
      .eq('status', 'available')
      .gt('starts_at', new Date().toISOString())
      .gte('starts_at', query.from)
      .lt('starts_at', query.to)
      .order('starts_at', { ascending: true })
      .limit(APPOINTMENT_SLOT_PAGE_LIMIT);
    if (error) return json({ apiVersion: APPOINTMENT_SLOTS_API_VERSION, state: 'unavailable' }, 503);
    const slots = data ?? [];
    return json({
      apiVersion: APPOINTMENT_SLOTS_API_VERSION,
      state: slots.length ? 'available' : 'empty',
      serviceListingId: query.serviceListingId,
      slots,
      truncated: slots.length === APPOINTMENT_SLOT_PAGE_LIMIT,
    });
  } catch {
    return json({ apiVersion: APPOINTMENT_SLOTS_API_VERSION, state: 'unavailable' }, 503);
  }
};
