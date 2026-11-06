export async function requestProductOptions(listingId, { baseUrl = globalThis.location?.origin, signal, fetchImpl = fetch } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) throw Error('Product ID is invalid.');
  const origin = new URL(baseUrl);
  if (!['https:','http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('Catalogue origin is invalid.');
  const response = await fetchImpl(new URL(`/api/catalog/${listingId}/options`, origin), { signal, redirect:'error',cache:'no-store',credentials:'omit' });
  if (!response.ok) throw Error('Product options are unavailable.');
  const body = await response.json();
  if (body?.apiVersion !== 1 || body.state !== 'available' || body.listingId !== listingId || body.currencyCode !== 'INR' || !Array.isArray(body.options) || body.options.length > 1000) throw Error('Product options are invalid.');
  const seen = new Set();
  for (const option of body.options) {
    if (!option || typeof option.label !== 'string' || option.label.length > 6000 || !(option.variantId === null || typeof option.variantId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(option.variantId)) || seen.has(option.variantId)) throw Error('Product options are invalid.');
    // Known zero-stock options remain visible but cannot be selected.
    if (!Number.isSafeInteger(option.priceMinor) || option.priceMinor <= 0 || !(option.stockQuantity === null || Number.isSafeInteger(option.stockQuantity) && option.stockQuantity >= 0)) throw Error('Product options are invalid.');
    if (!option.attributes || typeof option.attributes !== 'object' || Array.isArray(option.attributes) || Object.keys(option.attributes).length>20 || Object.entries(option.attributes).some(([key,value])=>key.length>100||typeof value!=='string'||value.length>200)) throw Error('Product attributes are invalid.');
    seen.add(option.variantId);
  }
  return body.options;
}
