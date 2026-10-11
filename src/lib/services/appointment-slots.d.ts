export const APPOINTMENT_SLOTS_API_VERSION: number;
export const APPOINTMENT_SLOT_WINDOW_MAX_DAYS: number;
export const APPOINTMENT_SLOT_PAGE_LIMIT: number;
export class AppointmentSlotQueryError extends Error {}
export type AppointmentSlotQuery = { serviceListingId: string; from: string; to: string };
export function parseAppointmentSlotQuery(params: URLSearchParams, now?: number): AppointmentSlotQuery;
