import type { AstroCookies } from 'astro';
import { getMarketplaceProducts } from '../marketplace/featured-products';
import { loadProductOptions } from './product-selection.js';
import type { authenticateApiRequest } from '../supabase/api-auth';
import type { QuoteRequestLine } from './checkout-quote.js';
/** No order repository, shipping, tax or payment adapter is configured by default. */
export async function checkoutDependencies(auth: Extract<Awaited<ReturnType<typeof authenticateApiRequest>>,{state:'authenticated'}>, request:Request, cookies:AstroCookies) {
  return { loadProducts:async (lines:QuoteRequestLine[]) => {
    const result = await getMarketplaceProducts(request,cookies,lines.length,{marketCode:'IN',listingIds:[...new Set(lines.map(line=>line.listingId))]});
    if(result.state!=='available') throw Error('Catalogue unavailable.');
    return loadProductOptions(auth.supabase,result.products);
  } };
}
