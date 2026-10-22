import type { AstroCookies } from 'astro';
import { createSupabaseServerClient } from '../supabase/server';
import { authenticateApiRequest } from '../supabase/api-auth';
import { getProductTaxonomy } from '../marketplace/featured-products';
import { getSupabasePublicConfig } from '../supabase/config';
import { hasSellerCatalogRole } from './permissions.js';

export const LISTING_IMAGES_BUCKET = 'listing-images';

export async function loadSellerDashboard(request: Request, cookies: AstroCookies) {
  const auth = await authenticateApiRequest(request, cookies);
  // Page callers already render a 503 workspace state when loading throws.
  if (auth.state === 'unavailable') throw new Error('Seller authentication is temporarily unavailable.');
  const supabase = auth.state === 'authenticated' ? auth.supabase : createSupabaseServerClient({ request, cookies });
  if (auth.state !== 'authenticated') return { supabase, user: null, memberships: [], businesses: [], products: [], error: null };
  const { user } = auth;

  const { data: memberships, error: membershipError } = await supabase
    .from('business_memberships').select('business_id, member_role')
    .eq('profile_id', user.id).eq('membership_status', 'active');
  if (membershipError) throw membershipError;
  const membershipByBusiness = new Map((memberships ?? []).map(row => [row.business_id, row.member_role]));
  const businessIds = [...membershipByBusiness.keys()];
  if (!businessIds.length) return { supabase, user, memberships: memberships ?? [], businesses: [], products: [], error: null };

  const [{ data: businesses, error: businessError }, { data: listings, error: listingsError }] = await Promise.all([
    supabase.rpc('get_my_seller_businesses'),
    supabase.from('listings').select('id, business_id, title, slug, description, category_id, moderation_status, created_at, updated_at, catalogue_revision::text')
      .in('business_id', businessIds).eq('kind', 'product').is('archived_at', null).order('updated_at', { ascending: false }),
  ]);
  if (businessError) throw businessError;
  if (listingsError) throw listingsError;
  const listingIds = (listings ?? []).map(row => row.id);
  const categoryIds = [...new Set((listings ?? []).map(row => row.category_id))];
  const [{ data: prices, error: priceError }, { data: categories, error: categoriesError }] = listingIds.length
    ? await Promise.all([
      supabase.from('listing_prices').select('listing_id, product_variant_id, amount_minor, currency_code, status, valid_from, valid_to')
        .in('listing_id', listingIds).order('valid_from', { ascending: false }),
      supabase.from('categories').select('id, name').in('id', categoryIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (priceError) throw priceError;
  if (categoriesError) throw categoriesError;
  const variants = listingIds.length
    ? await supabase.from('product_variants').select('id, listing_id, seller_sku, option_attributes, active_status').in('listing_id', listingIds)
    : { data: [], error: null };
  if (variants.error) throw variants.error;
  const categoryById = new Map((categories ?? []).map(row => [row.id, row.name]));
  const businessById = new Map((businesses ?? []).map(row => [row.id, row]));
  const variantsById = new Map((variants.data ?? []).map(row => [row.id, row]));
  const now = Date.now();
  const products = (listings ?? []).map(listing => {
    const currentPrices = (prices ?? []).filter(price => price.listing_id === listing.id && price.status === 'active'
      && new Date(price.valid_from).getTime() <= now && (!price.valid_to || new Date(price.valid_to).getTime() > now)
      && (price.product_variant_id === null || variantsById.get(price.product_variant_id)?.active_status));
    const amountMinor = currentPrices.length ? Math.min(...currentPrices.map(price => Number(price.amount_minor))) : null;
    return {
      ...listing,
      categoryName: categoryById.get(listing.category_id) ?? 'Category unavailable',
      businessName: businessById.get(listing.business_id)?.display_name ?? 'Seller profile',
      memberRole: membershipByBusiness.get(listing.business_id) ?? '',
      priceMinor: amountMinor,
      currencyCode: currentPrices[0]?.currency_code ?? 'INR',
      hasVariants: (variants.data ?? []).some(variant => variant.listing_id === listing.id && variant.active_status),
    };
  });
  return { supabase, user, memberships: memberships ?? [], businesses: businesses ?? [], products, error: null };
}

export async function getSellerTaxonomy(request: Request, cookies: AstroCookies) {
  return getProductTaxonomy(request, cookies);
}

export async function sellerSignedImageUrl(supabase: ReturnType<typeof createSupabaseServerClient>, path: string) {
  const bucket = getSupabasePublicConfig()?.listingImagesBucket || LISTING_IMAGES_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

export { hasSellerCatalogRole };
