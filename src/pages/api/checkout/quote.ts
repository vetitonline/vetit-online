import type { APIRoute } from 'astro';
import type { QuoteRequestLine } from '../../../lib/commerce/checkout-quote.js';
import { calculateCheckoutQuote, CheckoutQuoteError, normalizeQuoteLines } from '../../../lib/commerce/checkout-quote.js';
import { getMarketplaceProducts } from '../../../lib/marketplace/featured-products';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
class RequestTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new RequestTooLargeError();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

/** Authenticated, read-only INR product subtotal. This endpoint does not reserve stock or create an order. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ state: 'invalid_request', message: 'Send a JSON request.' }, 415);
  }

  let body: unknown;
  try {
    const raw = await readBoundedBody(request);
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof RequestTooLargeError) return json({ state: 'invalid_request', message: 'Request is too large.' }, 413);
    return json({ state: 'invalid_request', message: 'Request JSON is invalid.' }, 400);
  }

  let lines: QuoteRequestLine[];
  try {
    lines = normalizeQuoteLines(body);
  } catch (error) {
    if (error instanceof CheckoutQuoteError) return json({ state: 'invalid_request', code: error.code, message: error.message }, 400);
    return json({ state: 'invalid_request', message: 'Cart lines are invalid.' }, 400);
  }

  try {
    const auth = await authenticateApiRequest(request, cookies);
    if (auth.state === 'unavailable') return json({ state: 'unavailable', message: 'Marketplace quoting is temporarily unavailable.' }, 503);
    if (auth.state !== 'authenticated') return json({ state: 'unauthorized', message: 'Sign in to request a cart quote.' }, 401);

    const catalogue = await getMarketplaceProducts(request, cookies, lines.length, {
      marketCode: 'IN',
      listingIds: lines.map((line) => line.listingId),
    });
    if (catalogue.state !== 'available') {
      return json({ state: 'unavailable', message: 'Marketplace quoting is temporarily unavailable.' }, 503);
    }
    const quote = calculateCheckoutQuote(lines, catalogue.products);
    return json({ ...quote, apiVersion: 1 }, 200);
  } catch (error) {
    if (error instanceof CheckoutQuoteError) {
      const status = error.code === 'listing_unavailable' ? 409 : 422;
      return json({ state: 'quote_unavailable', code: error.code, message: error.message }, status);
    }
    console.error('[checkout] Quote request failed.', error instanceof Error ? error.message : 'Unknown error');
    return json({ state: 'unavailable', message: 'Marketplace quoting is temporarily unavailable.' }, 503);
  }
};
