import type { APIRoute } from 'astro';
import { getMarketplaceProduct } from '../../../../lib/marketplace/featured-products';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { loadProductOptions } from '../../../../lib/commerce/product-selection.js';
export const prerender = false;
export const GET: APIRoute = async ({ request, cookies, params }) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  try {
    const result = await getMarketplaceProduct(request, cookies, params.id ?? '');
    if (result.state !== 'available') return json({ state: 'unavailable' }, 503);
    if (!result.product) return json({ state: 'not_found' }, 404);
    const [product] = await loadProductOptions(createSupabaseServerClient({ request, cookies }), [result.product]);
    return json({ apiVersion: 1, state: 'available', listingId: product.id, currencyCode: 'INR', options: product.options, stockState: product.options.every(option=>option.stockQuantity===null)?'unknown':product.options.every(option=>option.stockQuantity!==null)?'known':'partial' });
  } catch { return json({ state: 'unavailable' }, 503); }
};
