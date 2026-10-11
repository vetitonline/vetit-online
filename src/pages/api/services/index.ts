import type { APIRoute, AstroCookies } from 'astro';
import { readJsonBody } from '../../../lib/api/json-body.js';
import { getPublicServices } from '../../../lib/marketplace/services';
import { normalizeServiceSearch, ServiceSearchError } from '../../../lib/services/service-search.js';

export const prerender = false;
const json = (body: unknown, status = 200, cacheable = status === 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheable ? 'public, max-age=0, s-maxage=30' : 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const response = async (request: Request, cookies: AstroCookies, input: URLSearchParams | Record<string, unknown>, cacheable: boolean) => {
  const search = normalizeServiceSearch(input);
  const result = await getPublicServices(request, cookies, search);
  const status = result.state === 'error' || result.state === 'unconfigured' ? 503 : 200;
  return json({ apiVersion: 1, ...result }, status, cacheable && status === 200);
};

export const GET: APIRoute = async ({ request, cookies, url }) => {
  try {
    if (url.searchParams.has('latitude') || url.searchParams.has('longitude')) {
      return json({ apiVersion: 1, state: 'invalid_request', message: 'Use the same-origin POST endpoint for permission-based location searches.' }, 400);
    }
    return await response(request, cookies, url.searchParams, true);
  } catch (error) {
    if (error instanceof ServiceSearchError) return json({ apiVersion: 1, state: 'invalid_request', message: error.message }, 400);
    return json({ apiVersion: 1, state: 'unavailable' }, 503);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ apiVersion: 1, state: 'invalid_request' }, 415);
  }
  const body = await readJsonBody(request, 4096);
  if (!body.ok || !body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
    return json({ apiVersion: 1, state: 'invalid_request' }, body.ok ? 400 : body.status);
  }
  try {
    return await response(request, cookies, body.value as Record<string, unknown>, false);
  } catch (error) {
    if (error instanceof ServiceSearchError) return json({ apiVersion: 1, state: 'invalid_request', message: error.message }, 400);
    return json({ apiVersion: 1, state: 'unavailable' }, 503);
  }
};
