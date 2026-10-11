import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { sellerBusinessInput } from '../../../lib/seller/validation.js';
import { canManageSellerBusiness } from '../../../lib/seller/permissions.js';
import { isSameOriginFormMutation } from '../../../lib/api/request-security.js';

const redirect = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginFormMutation(request)) return new Response('Cross-origin seller changes are not allowed.', { status: 403 });
  if (!getSupabasePublicConfig()) return new Response('Seller workspace is unavailable.', { status: 503 });
  if (!['application/x-www-form-urlencoded', 'multipart/form-data'].includes(request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '')) {
    return new Response('Seller business form is invalid.', { status: 415 });
  }
  let failurePath = '/seller/onboarding?error=save';
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return redirect(request, '/login?mode=join&next=%2Fseller');
    const form = await request.formData();
    const existingBusinessId = String(form.get('business_id') ?? '').trim();
    if (existingBusinessId) {
      failurePath = '/seller?error=save';
      const { data: membership, error: membershipError } = await supabase.from('business_memberships')
        .select('profile_id, business_id, member_role, membership_status').eq('business_id', existingBusinessId).eq('profile_id', user.id)
        .eq('membership_status', 'active').maybeSingle();
      if (membershipError || !canManageSellerBusiness(membership, user.id, existingBusinessId, new Set(['owner', 'admin']))) return new Response('Business profile access denied.', { status: 403 });
      const { data: business, error: businessError } = await supabase.from('businesses').select('business_type, is_active, archived_at').eq('id', existingBusinessId).maybeSingle();
      if (businessError || !business) return new Response('Business profile not found.', { status: 404 });
      if (!business.is_active || business.archived_at) return new Response('Inactive seller profiles cannot be changed.', { status: 403 });
      const input = sellerBusinessInput(form, business.business_type);
      const { error } = await supabase.from('businesses').update({
        display_name: input.displayName,
        legal_name: input.legalName,
        public_email: input.publicEmail,
        public_phone: input.publicPhone,
        website_url: input.websiteUrl,
      }).eq('id', existingBusinessId);
      if (error) throw error;
      return redirect(request, '/seller?saved=business');
    }

    const input = sellerBusinessInput(form);
    const { error } = await supabase.rpc('create_seller_business', {
      p_display_name: input.displayName,
      p_legal_name: input.legalName,
      p_business_type: input.businessType,
      p_public_email: input.publicEmail,
      p_public_phone: input.publicPhone,
      p_website_url: input.websiteUrl,
    });
    if (error) throw error;
    return redirect(request, '/seller?saved=business');
  } catch (error) {
    console.error('[seller] Business profile operation failed.', error instanceof Error ? error.message : 'Unknown error');
    return redirect(request, failurePath);
  }
};
