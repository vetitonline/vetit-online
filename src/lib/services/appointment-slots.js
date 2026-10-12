const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
export const APPOINTMENT_SLOTS_API_VERSION = 1;
export const APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS = 14;
export const APPOINTMENT_SLOT_WINDOW_MAX_DAYS = 31;
export const APPOINTMENT_SLOT_PAGE_LIMIT = 100;

export class AppointmentSlotQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppointmentSlotQueryError';
  }
}

function parseTimestamp(value, label) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    throw new AppointmentSlotQueryError(`${label} must be an ISO timestamp with a timezone.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new AppointmentSlotQueryError(`${label} is invalid.`);
  return timestamp;
}

/** Validate the bounded, read-only appointment slot query shared by all HTTP clients. */
export function parseAppointmentSlotQuery(params, now = Date.now()) {
  const serviceListingId = (params.get('serviceListingId') || '').trim();
  if (!UUID.test(serviceListingId)) throw new AppointmentSlotQueryError('Service listing ID is invalid.');

  const fromValue = params.get('from');
  const toValue = params.get('to');
  const from = fromValue === null ? now : parseTimestamp(fromValue, 'Start time');
  const to = toValue === null ? now + APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000 : parseTimestamp(toValue, 'End time');
  if (from < now - 60_000) throw new AppointmentSlotQueryError('Start time cannot be in the past.');
  if (to <= from || to - from > APPOINTMENT_SLOT_WINDOW_MAX_DAYS * 24 * 60 * 60 * 1000) {
    throw new AppointmentSlotQueryError('The appointment window must be positive and no longer than 31 days.');
  }

  return { serviceListingId, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
