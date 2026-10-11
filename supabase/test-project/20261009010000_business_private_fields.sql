-- TEST PROJECT ONLY: prevent Data API reads of legal business names while
-- preserving the existing public business directory fields and row policies.
-- This migration is intentionally outside supabase/migrations and is not
-- applied by this change.

revoke select on table public.businesses from anon, authenticated;
revoke select (legal_name) on table public.businesses from anon, authenticated;

grant select (
  id,
  display_name,
  business_type,
  public_email,
  public_phone,
  website_url,
  country_code,
  verification_status,
  is_active,
  archived_at,
  created_at,
  updated_at
) on table public.businesses to anon, authenticated;

-- The seller dashboard receives only businesses linked to the current
-- authenticated user. A legal name is returned only to owners and admins.
create or replace function public.get_my_seller_businesses()
returns table (
  id uuid,
  display_name text,
  legal_name text,
  business_type text,
  public_email text,
  public_phone text,
  website_url text,
  verification_status text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.display_name,
    case when bm.member_role in ('owner', 'admin') then b.legal_name else null end,
    b.business_type,
    b.public_email,
    b.public_phone,
    b.website_url,
    b.verification_status,
    b.is_active,
    b.created_at
  from public.businesses b
  join public.business_memberships bm on bm.business_id = b.id
  where bm.profile_id = (select auth.uid())
    and bm.membership_status = 'active'
    and b.archived_at is null
  order by b.created_at, b.id;
$$;

revoke all on function public.get_my_seller_businesses() from public, anon, authenticated;
grant execute on function public.get_my_seller_businesses() to authenticated;
