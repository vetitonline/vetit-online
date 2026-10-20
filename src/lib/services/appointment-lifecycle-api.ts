import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import type { AppointmentCommand } from './appointment-lifecycle.js';
import type { AppointmentDashboard } from './appointment-lifecycle-client.js';

/** Separate from generated applied-schema types: these RPCs are proposal-only. */
export async function callAppointmentLifecycle(client: SupabaseClient<Database>, name: 'appointment_lifecycle_command' | 'appointment_lifecycle_dashboard' | 'appointment_lifecycle_policy', args: { p_command: AppointmentCommand } | { p_business_id: string | null } | { p_service_listing_id: string }) {
  const invoke = client.rpc.bind(client) as unknown as (name: string, args: object) => PromiseLike<{ data: AppointmentDashboard | Record<string, unknown> | null; error: { code: string; message: string } | null }>;
  return await invoke(name, args);
}
export function appointmentRpcStatus(code: string) {
  return code === '42501' ? 403 : code === 'P0002' ? 404 : ['40001', '23505', '23P01', '40P01'].includes(code) ? 409 : ['22023', '23514', '22P02'].includes(code) ? 422 : 503;
}
