import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { canManageSellerBusiness, canSellerTransitionListing } from '../../../lib/seller/permissions.js';
import { isSameOriginFormMutation } from '../../../lib/api/request-security.js';
import { executeModeration } from '../../../lib/moderation/workflow.js';
import type { QueueClient } from '../../../lib/moderation/queue.js';

const redirect = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginFormMutation(request)) return new Response('Cross-origin seller changes are not allowed.', { status: 403 });
  if (!getSupabasePublicConfig()) return new Response('Seller workspace is unavailable.', { status: 503 });
  if (!['application/x-www-form-urlencoded', 'multipart/form-data'].includes(request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '')) {
    return new Response('Seller submission form is invalid.', { status: 415 });
  }
  let form:FormData;
  try { form = await request.formData(); }
  catch { return new Response('Invalid seller submission form.', { status: 400 }); }
  if (form.getAll('listing_id').length !== 1 || form.getAll('business_id').length !== 1) return new Response('Ambiguous seller submission.', { status: 400 });
  const listingId = String(form.get('listing_id') ?? '').trim();
  const businessId = String(form.get('business_id') ?? '').trim();
  const returnPath = `/seller/products/${listingId}?error=submit`;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(listingId) || !uuid.test(businessId)) return new Response('Invalid seller product.', { status: 400 });
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return redirect(request, `/login?mode=join&next=${encodeURIComponent(returnPath)}`);
    const { data: membership, error: membershipError } = await supabase.from('business_memberships')
      .select('profile_id, business_id, member_role, membership_status').eq('business_id', businessId).eq('profile_id', user.id)
      .eq('membership_status', 'active').maybeSingle();
    if (membershipError || !canManageSellerBusiness(membership, user.id, businessId)) return new Response('Seller catalogue access denied.', { status: 403 });
    const { data: business, error: businessError } = await supabase.from('businesses').select('id, is_active, archived_at').eq('id', businessId).maybeSingle();
    if (businessError || !business || !business.is_active || business.archived_at) return new Response('Seller profile is inactive.', { status: 403 });
    const { data: listing, error: listingError } = await supabase.from('listings').select('business_id, kind, moderation_status').eq('id', listingId).maybeSingle();
    if (listingError || !listing || listing.business_id !== businessId || listing.kind !== 'product' || !canSellerTransitionListing(listing.moderation_status, 'submitted')) {
      return new Response('Only your draft or rejected product listings can be submitted for review.', { status: 403 });
    }
    // The database operation submits through the existing validated product RPC
    // and opens its durable case atomically; no second HTTP write can be lost.
    await executeModeration(supabase as unknown as QueueClient, { action: 'open', kind: 'product', subject: listingId });
    return redirect(request, `/seller/products/${listingId}?submitted=1`);
  } catch (error) {
    console.error('[seller] Product review submission failed.');
    return redirect(request, returnPath);
  }
};
