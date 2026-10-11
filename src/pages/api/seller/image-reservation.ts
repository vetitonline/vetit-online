import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { canManageSellerImage } from '../../../lib/seller/permissions.js';
import { sellerImageExtension } from '../../../lib/seller/validation.js';

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!getSupabasePublicConfig()) return json({ error: 'unavailable' }, 503);
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'authentication_required' }, 401);
    const input = await request.json();
    const listingId = String(input?.listing_id ?? '').trim();
    const extension = sellerImageExtension(input?.content_type);
    const altText = String(input?.alt_text ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(listingId) || !extension || altText.length > 500) return json({ error: 'invalid_image_request' }, 400);

    const { data: listing, error: listingError } = await supabase.from('listings')
      .select('id, business_id, kind, moderation_status, archived_at').eq('id', listingId).maybeSingle();
    if (listingError || !listing || listing.kind !== 'product' || listing.archived_at || !['draft', 'rejected'].includes(listing.moderation_status)) {
      return json({ error: 'listing_not_editable' }, 403);
    }
    const [{ data: business, error: businessError }, { data: membership, error: membershipError }] = await Promise.all([
      supabase.from('businesses').select('id, is_active, archived_at').eq('id', listing.business_id).maybeSingle(),
      supabase.from('business_memberships').select('profile_id, business_id, member_role, membership_status')
        .eq('business_id', listing.business_id).eq('profile_id', user.id).eq('membership_status', 'active').maybeSingle(),
    ]);
    if (businessError || !business || !business.is_active || business.archived_at) return json({ error: 'seller_inactive' }, 403);
    if (membershipError || !canManageSellerImage(membership, user.id, listing.business_id, listing.business_id, listing.moderation_status)) {
      return json({ error: 'seller_access_denied' }, 403);
    }

    const path = `${listing.business_id}/${listing.id}/${crypto.randomUUID()}.${extension}`;
    const { data: image, error: imageError } = await supabase.from('listing_images').insert({
      listing_id: listing.id,
      storage_object_path: path,
      alt_text: altText || null,
    }).select('id, storage_object_path').single();
    if (imageError || !image) {
      console.error('[seller] Photo reservation failed.', imageError?.message ?? 'No row returned');
      return json({ error: 'image_limit_or_access' }, 422);
    }
    return json({ imageId: image.id, path: image.storage_object_path }, 201);
  } catch (error) {
    console.error('[seller] Photo reservation request failed.', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'image_reservation_failed' }, 422);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!getSupabasePublicConfig()) return json({ error: 'unavailable' }, 503);
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'authentication_required' }, 401);
    const input = await request.json();
    const imageId = String(input?.image_id ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(imageId)) return json({ error: 'invalid_image_request' }, 400);
    const { error } = await supabase.rpc('cancel_seller_image_reservation', { p_image_id: imageId });
    if (error) {
      console.error('[seller] Photo reservation cleanup failed.', error.message);
      return json({ error: 'image_reservation_cleanup_failed' }, 422);
    }
    return json({ ok: true });
  } catch (error) {
    console.error('[seller] Photo reservation cleanup failed.', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'image_reservation_cleanup_failed' }, 422);
  }
};
