import { normalizeQuoteLines, calculateCheckoutQuote } from './checkout-quote.js';
export class QuoteClientError extends Error {
  constructor(status) { super(status === 401 ? 'Sign in to review current prices.' : status === 409 || status === 422 ? 'Some items need review. Return to your cart and check their availability or options.' : 'Price review is temporarily unavailable.'); this.status = status; }
}
export async function requestCheckoutQuote(lines, { baseUrl = globalThis.location?.origin, fetchImpl = fetch, signal, accessToken, profileId } = {}) {
  if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||/\s/.test(accessToken)))throw new QuoteClientError(401);
  if(profileId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId))throw new QuoteClientError(400);
  const normalized = normalizeQuoteLines({ lines });
  let origin;
  try { origin = new URL(baseUrl); if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error(); }
  catch { throw new QuoteClientError(400); }
  let response;
  try { response = await fetchImpl(new URL('/api/checkout/quote', origin).href, { method: 'POST', credentials: accessToken?'omit':'same-origin', redirect:'error', cache: 'no-store', headers: {'content-type':'application/json', accept:'application/json',...(profileId?{'x-vetit-profile-id':profileId}:{}),...(accessToken?{authorization:`Bearer ${accessToken}`}:{})}, body: JSON.stringify({lines:normalized}), signal }); }
  catch { throw new QuoteClientError(0); }
  if (!response.ok) throw new QuoteClientError(response.status);
  try {
    const body = await response.json();
    if (body?.apiVersion !== 1 || body.state !== 'quote_only' || body.checkoutEnabled !== false || body.marketCode !== 'IN' || body.currencyCode !== 'INR' || body.deliveryMinor !== null || body.feesMinor !== null || body.totalMinor !== null || !Array.isArray(body.lines) || body.lines.length !== normalized.length) throw Error();
    if(profileId&&body.profileId!==profileId)throw Error();
    if(body.stockState!==undefined&&!['known','partial','unknown'].includes(body.stockState))throw Error();
    const key = line => `${line.listingId}:${line.productVariantId ?? ''}`;
    const byId = new Map(body.lines.map(line => [key(line),line]));
    if (byId.size !== normalized.length) throw Error();
    for (const line of normalized) {
      const returned = byId.get(key(line));
      if (!returned || returned.quantity !== line.quantity || returned.currencyCode !== 'INR' || !['title','category','sellerName'].every(key => typeof returned[key] === 'string' && returned[key].length <= 1000) || returned.lineAmountMinor !== returned.unitAmountMinor * line.quantity) throw Error();
    }
    const products = new Map();
    for (const line of body.lines) {
      if (!products.has(line.listingId)) products.set(line.listingId, {id:line.listingId,title:line.title,category:line.category,sellerName:line.sellerName,priceMinor:null,priceIsFrom:false,currencyCode:'INR',options:[]});
      products.get(line.listingId).options.push({variantId:line.productVariantId ?? null,priceMinor:line.unitAmountMinor,stockQuantity:null});
    }
    const quote = calculateCheckoutQuote(normalized, [...products.values()]);
    if (quote.subtotalMinor !== body.subtotalMinor) throw Error();
    return { ...quote, apiVersion:1, ...(body.stockState!==undefined?{stockState:body.stockState}:{}) };
  } catch { throw new QuoteClientError(503); }
}
