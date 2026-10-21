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
  // Date.parse normalizes impossible dates such as February 30. Reject them
  // before querying availability rather than silently moving the user's window.
  const [year,month,day,hour,minute]=value.slice(0,16).split(/[-T:]/i).map(Number);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59)throw new AppointmentSlotQueryError(`${label} is invalid.`);
  if (!Number.isFinite(timestamp)) throw new AppointmentSlotQueryError(`${label} is invalid.`);
  return timestamp;
}

/** Validate the bounded, read-only appointment slot query shared by all HTTP clients. */
export function parseAppointmentSlotQuery(params, now = Date.now()) {
  for(const key of ['serviceListingId','from','to'])if(typeof params.getAll==='function'&&params.getAll(key).length>1)throw new AppointmentSlotQueryError('Duplicate appointment query fields are not allowed.');
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
