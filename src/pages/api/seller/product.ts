import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { getSellerTaxonomy } from '../../../lib/seller/data';
import { sellerProductInput } from '../../../lib/seller/validation.js';
import { canEditSellerProduct, canManageSellerBusiness } from '../../../lib/seller/permissions.js';

const redirect = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!getSupabasePublicConfig()) return new Response('Seller workspace is unavailable.', { status: 503 });
  let listingPath = '/seller/products/new?error=save';
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return redirect(request, '/login?mode=join&next=%2Fseller%2Fproducts%2Fnew');
    const form = await request.formData();
    const businessId = String(form.get('business_id') ?? '').trim();
    const listingId = String(form.get('listing_id') ?? '').trim() || null;
    if (!/^[0-9a-f-]{36}$/i.test(businessId) || (listingId && !/^[0-9a-f-]{36}$/i.test(listingId))) throw new Error('Choose a valid seller profile.');
    const { data: membership, error: membershipError } = await supabase.from('business_memberships')
      .select('profile_id, business_id, member_role, membership_status').eq('business_id', businessId).eq('profile_id', user.id)
      .eq('membership_status', 'active').maybeSingle();
    if (membershipError || !canManageSellerBusiness(membership, user.id, businessId)) return new Response('Seller catalogue access denied.', { status: 403 });
    if (listingId) {
      const { data: listing, error: listingError } = await supabase.from('listings').select('business_id, moderation_status').eq('id', listingId).maybeSingle();
      if (listingError || !listing || listing.business_id !== businessId || !canEditSellerProduct(listing.moderation_status)) {
        return new Response('Only your draft or rejected product listings can be edited.', { status: 403 });
      }
    }

    const taxonomy = await getSellerTaxonomy(request, cookies);
    if (taxonomy.state !== 'available') throw new Error('Product categories are currently unavailable.');
    const categorySpecies = new Map(taxonomy.categories.map(category => [category.id, new Set(category.species)]));
    const product = sellerProductInput(form, categorySpecies);
    listingPath = listingId ? `/seller/products/${listingId}?error=save` : '/seller/products/new?error=save';
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
    if (saveError || !savedListingId) throw saveError ?? new Error('Product draft could not be saved.');
    listingPath = `/seller/products/${savedListingId}?saved=1`;
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ listingId: savedListingId }), { status: 201, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return redirect(request, listingPath);
  } catch (error) {
    console.error('[seller] Product draft operation failed.', error instanceof Error ? error.message : 'Unknown error');
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'draft_save_failed' }), { status: 422, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return redirect(request, listingPath);
  }
};
