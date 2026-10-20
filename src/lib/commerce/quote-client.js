import { normalizeQuoteLines, calculateCheckoutQuote } from './checkout-quote.js';
export class QuoteClientError extends Error {
  constructor(status) { super(status === 401 ? 'Sign in to review current prices.' : status === 409 || status === 422 ? 'Some items need review. Return to your cart and check their availability or options.' : 'Price review is temporarily unavailable.'); this.status = status; }
}
export async function requestCheckoutQuote(lines, { baseUrl = globalThis.location?.origin, fetchImpl = fetch, signal, accessToken } = {}) {
  if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||/\s/.test(accessToken)))throw new QuoteClientError(401);
  const normalized = normalizeQuoteLines({ lines });
  let origin;
  try { origin = new URL(baseUrl); if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error(); }
  catch { throw new QuoteClientError(400); }
  let response;
  try { response = await fetchImpl(new URL('/api/checkout/quote', origin).href, { method: 'POST', credentials: accessToken?'omit':'same-origin', redirect:'error', cache: 'no-store', headers: {'content-type':'application/json', accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{})}, body: JSON.stringify({lines:normalized}), signal }); }
  catch { throw new QuoteClientError(0); }
  if (!response.ok) throw new QuoteClientError(response.status);
  try {
    const body = await response.json();
    if (body?.apiVersion !== 1 || body.state !== 'quote_only' || body.checkoutEnabled !== false || body.marketCode !== 'IN' || body.currencyCode !== 'INR' || body.deliveryMinor !== null || body.feesMinor !== null || body.totalMinor !== null || !Array.isArray(body.lines) || body.lines.length !== normalized.length) throw Error();
    const byId = new Map(body.lines.map(line => [line.listingId,line]));
    if (byId.size !== normalized.length) throw Error();
    for (const line of normalized) {
      const returned = byId.get(line.listingId);
      if (!returned || returned.quantity !== line.quantity || returned.currencyCode !== 'INR' || !['title','category','sellerName'].every(key => typeof returned[key] === 'string' && returned[key].length <= 1000) || returned.lineAmountMinor !== returned.unitAmountMinor * line.quantity) throw Error();
    }
    const quote = calculateCheckoutQuote(normalized, body.lines.map(line => ({id:line.listingId, title:line.title, category:line.category, sellerName:line.sellerName, priceMinor:line.unitAmountMinor, priceIsFrom:false, currencyCode:line.currencyCode})));
    if (quote.subtotalMinor !== body.subtotalMinor) throw Error();
    return { ...quote, apiVersion:1 };
  } catch { throw new QuoteClientError(503); }
}
