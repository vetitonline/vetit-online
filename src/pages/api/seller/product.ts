import type { APIRoute } from 'astro';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { getSellerTaxonomy } from '../../../lib/seller/data';
import { sellerProductInput, assertSingleSellerFields, isSellerUuid } from '../../../lib/seller/validation.js';
import { canEditSellerProduct, canManageSellerBusiness } from '../../../lib/seller/permissions.js';
import { isSameOriginFormMutation } from '../../../lib/api/request-security.js';

const redirect = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginFormMutation(request)) return new Response('Cross-origin seller changes are not allowed.', { status: 403 });
  if (!getSupabasePublicConfig()) return new Response('Seller workspace is unavailable.', { status: 503 });
  if (!['application/x-www-form-urlencoded', 'multipart/form-data'].includes(request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '')) {
    return new Response('Seller product form is invalid.', { status: 415 });
  }
  let listingPath = '/seller/products/new?error=save';
  let saveStarted = false;
  try {
    const auth = await authenticateApiRequest(request, cookies);
    if (auth.state === 'unavailable') {
      return request.headers.get('accept')?.includes('application/json')
        ? Response.json({ error: 'draft_auth_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } })
        : new Response('Seller authentication is temporarily unavailable.', { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    if (auth.state !== 'authenticated') return redirect(request, '/login?mode=join&next=%2Fseller%2Fproducts%2Fnew');
    const { supabase, user } = auth;
    let form:FormData;
    try { form = await request.formData(); assertSingleSellerFields(form, ['business_id', 'listing_id']); }
    catch { return new Response('Invalid seller product form.', { status: 400 }); }
    const businessId = String(form.get('business_id') ?? '').trim();
    const listingId = String(form.get('listing_id') ?? '').trim() || null;
    if (!isSellerUuid(businessId) || (listingId && !isSellerUuid(listingId))) return new Response('Choose a valid seller profile.', { status: 400 });
    const { data: membership, error: membershipError } = await supabase.from('business_memberships')
      .select('profile_id, business_id, member_role, membership_status').eq('business_id', businessId).eq('profile_id', user.id)
      .eq('membership_status', 'active').maybeSingle();
    if (membershipError || !canManageSellerBusiness(membership, user.id, businessId)) return new Response('Seller catalogue access denied.', { status: 403 });
    const { data: business, error: businessError } = await supabase.from('businesses').select('id, is_active, archived_at').eq('id', businessId).maybeSingle();
    if (businessError || !business || !business.is_active || business.archived_at) return new Response('Seller profile is inactive.', { status: 403 });
    if (listingId) {
      const { data: listing, error: listingError } = await supabase.from('listings').select('business_id, kind, archived_at, moderation_status').eq('id', listingId).maybeSingle();
      if (listingError || !listing || listing.business_id !== businessId || listing.kind !== 'product' || listing.archived_at || !canEditSellerProduct(listing.moderation_status)) {
        return new Response('Only your draft or rejected product listings can be edited.', { status: 403 });
      }
    }

    const taxonomy = await getSellerTaxonomy(request, cookies);
    if (taxonomy.state !== 'available') throw new Error('Product categories are currently unavailable.');
    const categorySpecies = new Map(taxonomy.categories.map(category => [category.id, new Set(category.species)]));
    const product = sellerProductInput(form, categorySpecies);
    listingPath = listingId ? `/seller/products/${listingId}?error=save` : '/seller/products/new?error=save';
    saveStarted = true;
    const { data: savedListingId, error: saveError } = await supabase.rpc('save_seller_product', {
      p_listing_id: listingId,
      p_business_id: businessId,
      p_title: product.title,
      p_slug: product.slug,
      p_description: product.description,
      p_category_id: product.categoryId,
      p_species_ids: product.speciesIds,
      p_base_amount_minor: product.baseAmountMinor,
      p_variants: product.variants,
    });
    if (saveError?.code === '23505' && request.headers.get('accept')?.includes('application/json')) return new Response(JSON.stringify({ error: 'draft_conflict' }), { status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    if (saveError || typeof savedListingId !== 'string' || !isSellerUuid(savedListingId) || (listingId && savedListingId.toLowerCase() !== listingId.toLowerCase())) throw new Error('Product draft save was not confirmed.');
    listingPath = `/seller/products/${savedListingId}?saved=1`;
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ listingId: savedListingId }), { status: 201, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return redirect(request, listingPath);
  } catch (error) {
    console.error('[seller] Product draft operation failed.');
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ error: saveStarted ? 'draft_save_unconfirmed' : 'draft_save_failed' }), { status: saveStarted ? 503 : 422, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return redirect(request, listingPath);
  }
};
