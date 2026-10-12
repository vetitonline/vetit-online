import { APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS } from './appointment-slots.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AppointmentClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AppointmentClientError';
    this.status = status;
  }
}

function endpoint(baseUrl) {
  const base = String(baseUrl ?? '').trim();
  if (!base) return '/api/services/slots';
  let url;
  try { url = new URL(base); } catch { throw new AppointmentClientError('Appointment API base URL is invalid.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new AppointmentClientError('Appointment API base URL must be an HTTP(S) origin without credentials.');
  }
  return new URL('/api/services/slots', url).toString();
}

function isResponse(value, requestedId) {
  return value && typeof value === 'object' && value.apiVersion === 1
    && ['available', 'empty', 'unavailable', 'invalid_request'].includes(value.state)
    && value.serviceListingId === requestedId && Array.isArray(value.slots)
    && value.slots.every((slot) => slot !== null && typeof slot === 'object'
      && typeof slot.id === 'string'
      && slot.service_listing_id === requestedId
      && typeof slot.starts_at === 'string' && Number.isFinite(Date.parse(slot.starts_at))
      && typeof slot.ends_at === 'string' && Number.isFinite(Date.parse(slot.ends_at))
      && Date.parse(slot.ends_at) > Date.parse(slot.starts_at))
    && typeof value.truncated === 'boolean'
    && (value.state !== 'available' || value.slots.length > 0)
    && (value.state !== 'empty' || value.slots.length === 0);
}

/** Read public future appointment slots; this client never creates a booking. */
export async function requestAppointmentSlots({ baseUrl = '', serviceListingId, signal, fetchImpl = fetch } = {}) {
  if (typeof serviceListingId !== 'string' || !UUID.test(serviceListingId)) {
    throw new AppointmentClientError('Service listing ID is invalid.', 400);
  }
  const url = new URL(endpoint(baseUrl), globalThis.location?.origin ?? 'https://vetit.online');
  url.searchParams.set('serviceListingId', serviceListingId);
  let response;
  try { response = await fetchImpl(url.toString(), { method: 'GET', headers: { accept: 'application/json' }, signal }); }
  catch { throw new AppointmentClientError('Appointment availability could not connect to Vetit Online.'); }
  // Error responses do not carry the listing/slots fields required on success.
  if (!response.ok) {
    throw new AppointmentClientError('Appointment availability is temporarily unavailable.', response.status);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new AppointmentClientError('Appointment availability returned an invalid response.', response.status); }
  if (!isResponse(body, serviceListingId)) throw new AppointmentClientError('Appointment availability returned an unsupported response.', response.status);
  if (body.state === 'unavailable' || body.state === 'invalid_request') {
    throw new AppointmentClientError('Appointment availability is temporarily unavailable.', response.status);
  }
  return {
    state: body.state,
    serviceListingId: body.serviceListingId,
    slots: body.slots.map((slot) => ({ id: slot.id, startsAt: slot.starts_at, endsAt: slot.ends_at })),
    truncated: body.truncated,
  };
}

/** Describe only the default window requested by this client, never all future availability. */
export function formatAppointmentAvailability(availability, formatTime = (value) => new Date(value).toLocaleString()) {
  const window = `next ${APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS} days`;
  const first = availability.slots[0];
  return first
    ? `Next available (${window}): ${formatTime(first.startsAt)}${availability.truncated ? ' · Results are limited.' : ''}`
    : `No appointment times found in the ${window}.`;
}
