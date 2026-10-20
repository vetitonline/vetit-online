import { AppointmentLifecycleError, appointmentId, normalizeAppointmentCommand, normalizeAppointmentPolicy } from './appointment-lifecycle.js';
export { AppointmentLifecycleError } from './appointment-lifecycle.js';
function endpoint(baseUrl) {
  const origin = baseUrl || globalThis.location?.origin;
  let url;
  try { url = new URL(origin); } catch { throw new AppointmentLifecycleError('Appointment API origin is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new AppointmentLifecycleError('Appointment API requires an HTTP(S) origin without credentials.');
  }
  return new URL('/api/appointments', url);
}
async function request(url, options, fetchImpl) {
  let response;
  try { response = await fetchImpl(url.toString(), options); } catch { throw new AppointmentLifecycleError('Appointment service could not be reached.', 0); }
  if (!response.ok) {
    const message = response.status === 401 ? 'Sign in to manage appointments.'
      : response.status === 403 ? 'This appointment action is not permitted.'
      : response.status === 409 ? 'The appointment changed or the slot was taken. Refresh and try again.'
      : response.status === 422 ? 'This action is outside the appointment policy or schedule.'
      : 'Appointment management is currently unavailable.';
    throw new AppointmentLifecycleError(message, response.status);
  }
  let body;
  try { body = await response.json(); } catch { throw new AppointmentLifecycleError('Appointment service returned an invalid response.'); }
  if (!body || body.apiVersion !== 1 || !['available', 'accepted'].includes(body.state) || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    throw new AppointmentLifecycleError('Appointment service returned an unsupported response.');
  }
  return body.data;
}
function headers(accessToken) {
  if (accessToken !== undefined && (typeof accessToken !== 'string' || !accessToken || accessToken.length > 8192 || /\s/.test(accessToken))) throw new AppointmentLifecycleError('Access token is invalid.');
  return { accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) };
}
export function getAppointmentDashboard({ baseUrl, businessId, accessToken, signal, fetchImpl = fetch } = {}) {
  const url = endpoint(baseUrl);
  if (businessId) url.searchParams.set('businessId', appointmentId(businessId));
  return request(url, { method: 'GET', headers: headers(accessToken), credentials: accessToken ? 'omit' : 'same-origin', redirect: 'error', signal, cache: 'no-store' }, fetchImpl).then(data => {
    const lists = ['bookings','events','waitlist','offers','notifications','providerBusinesses','services','slots','policies','payments','refunds'];
    if (!lists.every(key => Array.isArray(data[key]) && data[key].every(value => value !== null && typeof value === 'object' && !Array.isArray(value))) || typeof data.truncated !== 'boolean') {
      throw new AppointmentLifecycleError('Appointment dashboard returned an unsupported response.');
    }
    return data;
  });
}
export function getAppointmentPolicy(serviceListingId, { baseUrl, signal, fetchImpl = fetch } = {}) {
  const url = endpoint(baseUrl);
  url.searchParams.set('serviceListingId', appointmentId(serviceListingId));
  return request(url, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin', signal, cache: 'no-store' }, fetchImpl).then(data => {
    if (typeof data.title !== 'string' || !Number.isSafeInteger(data.priceMinor) || data.priceMinor < 0 || typeof data.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(data.currencyCode)) {
      throw new AppointmentLifecycleError('Appointment policy returned an unsupported response.');
    }
    return { ...data, policy: normalizeAppointmentPolicy(data.policy) };
  });
}
export function sendAppointmentCommand(input, { baseUrl, accessToken, signal, fetchImpl = fetch } = {}) {
  const command = normalizeAppointmentCommand(input);
  return request(endpoint(baseUrl), { method: 'POST', headers: { ...headers(accessToken), 'content-type': 'application/json' }, credentials: accessToken ? 'omit' : 'same-origin', redirect: 'error', cache:'no-store', body: JSON.stringify(command), signal }, fetchImpl);
}
