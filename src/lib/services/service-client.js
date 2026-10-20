import { normalizeServiceSearch } from './service-search.js';

export class ServiceClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ServiceClientError';
    this.status = status;
  }
}

function endpoint(baseUrl) {
  const base = String(baseUrl ?? '').trim();
  if (!base) return '/api/services';
  let url;
  try { url = new URL(base); } catch { throw new ServiceClientError('Service API base URL is invalid.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new ServiceClientError('Service API base URL must be an HTTP(S) origin without credentials.');
  }
  return new URL('/api/services', url).toString();
}

function isResponse(value) {
  return value && typeof value === 'object' && value.apiVersion === 1
    && ['available', 'unconfigured', 'error', 'invalid_request', 'unavailable'].includes(value.state)
    && Array.isArray(value.services) && Array.isArray(value.categories)
    && value.services.every((service) => service !== null && typeof service === 'object' && !Array.isArray(service)
      && typeof service.id === 'string'
      && typeof service.title === 'string' && typeof service.providerName === 'string'
      && (service.distanceKm === null || Number.isFinite(service.distanceKm)))
    && value.categories.every(category => category !== null && typeof category === 'object' && !Array.isArray(category)
      && typeof category.slug === 'string' && typeof category.name === 'string');
}

/** Request published services through the shared public HTTP API; coordinates use POST, never URL query strings. */
export async function requestServices({ baseUrl = '', filters = {}, location = null, signal, fetchImpl = fetch } = {}) {
  const input = normalizeServiceSearch({ ...filters, ...(location ?? {}) });
  const url = endpoint(baseUrl);
  const hasCoordinates = input.latitude !== null;
  let requestUrl = url;
  const init = { method: 'GET', headers: { accept: 'application/json' }, signal };
  if (hasCoordinates) {
    init.method = 'POST';
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(input);
  } else {
    const params = new URLSearchParams();
    for (const key of ['category', 'city', 'locality', 'postalCode', 'countryCode', 'limit']) {
      if (input[key]) params.set(key, String(input[key]));
    }
    if (params.size) requestUrl += `${requestUrl.includes('?') ? '&' : '?'}${params}`;
  }
  let response;
  try { response = await fetchImpl(requestUrl, init); }
  catch { throw new ServiceClientError('Service search could not connect to Vetit Online.'); }
  let body;
  try { body = await response.json(); } catch { throw new ServiceClientError('Service search returned an invalid response.', response.status); }
  if (!isResponse(body)) throw new ServiceClientError('Service search returned an unsupported response.', response.status);
  if (!response.ok) throw new ServiceClientError(body.state === 'unconfigured' ? 'Service search is not configured.' : 'Service search is temporarily unavailable.', response.status);
  return body;
}
