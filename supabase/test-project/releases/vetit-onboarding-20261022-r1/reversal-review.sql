-- REVIEW ONLY: restores weaker legacy validation/retry behavior; separate approval required.
-- No table rows are deleted or rewritten. All DDL is transactional and RESTRICT.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
do $approval$begin
 if current_setting('vetit.onboarding_reversal_approved',true) is distinct from '20261022015321' then raise exception 'Exact reversal approval token required';end if;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('vetit_onboarding.validate_business(text,text,text,text,text,text)') and md5(p.prosrc)='54b0d3cac0e172b2599349422069880c') then raise exception 'Installed onboarding function drift';end if;
if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('vetit_onboarding.guard_business_input()') and md5(p.prosrc)='e222634b6ec53a364791aaef56606794') then raise exception 'Installed onboarding function drift';end if;
if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.onboard_seller_business_v2(text,text,text,text,text,text)') and md5(p.prosrc)='f242c81717128c5542d44d29767bbf48') then raise exception 'Installed onboarding function drift';end if;
if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.create_seller_business(text,text,text,text,text,text)') and md5(p.prosrc)='5b5f76496f112159963f6d26a864c5b9') then raise exception 'Installed onboarding function drift';end if;
end;$approval$;
create or replace function public.create_seller_business(
  p_display_name text,
  p_legal_name text,
  p_business_type text,
  p_public_email text,
  p_public_phone text,
  p_website_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  business_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication is required to create a seller profile.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 or length(trim(p_display_name)) > 120
     or length(coalesce(trim(p_legal_name), '')) > 180 then
    raise exception 'Enter a business name between 2 and 120 characters.' using errcode = '22023';
  end if;
  if p_business_type is null or p_business_type not in ('individual', 'company', 'farm', 'other') then
    raise exception 'Choose a valid seller business type.' using errcode = '22023';
  end if;
  if p_public_email is not null and (length(trim(p_public_email)) > 254 or trim(p_public_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid public email address.' using errcode = '22023';
  end if;
  if length(coalesce(trim(p_public_phone), '')) > 32 then
    raise exception 'Public phone number is too long.' using errcode = '22023';
  end if;
  if p_website_url is not null and (length(trim(p_website_url)) > 2048 or trim(p_website_url) !~* '^https?://[^[:space:]]+$') then
    raise exception 'Enter a valid public website URL.' using errcode = '22023';
  end if;

  -- Provision the authenticated user's profile idempotently. The auth UUID is
  -- the only accepted identity; never accept profile identity or role from input.
  insert into public.profiles (id)
  values (requester_id)
  on conflict (id) do nothing;

  -- The profile row is the per-user mutex. One active owner business is reused
  -- on retries, including concurrent requests; registration never duplicates it.
  perform p.id from public.profiles p where p.id = requester_id for update;
  if not found then raise exception 'Unable to initialize the signed-in profile.' using errcode = '23503'; end if;
  select m.business_id into business_id
  from public.business_memberships m
  join public.businesses b on b.id = m.business_id
  where m.profile_id = requester_id and m.member_role = 'owner' and m.membership_status = 'active'
    and b.business_type in ('individual', 'company', 'farm', 'other')
  order by m.created_at, m.business_id limit 1;
  if found then return business_id; end if;

  insert into public.businesses (display_name, legal_name, business_type, public_email, public_phone, website_url, country_code)
  values (trim(p_display_name), nullif(trim(p_legal_name), ''), p_business_type,
    nullif(lower(trim(p_public_email)), ''), nullif(trim(p_public_phone), ''), nullif(trim(p_website_url), ''), 'IN')
  returning id into business_id;

  insert into public.business_memberships (business_id, profile_id, member_role, membership_status)
  values (business_id, requester_id, 'owner', 'active');
  return business_id;
end;
$$;
revoke all on function public.create_seller_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_seller_business(text,text,text,text,text,text) to authenticated;
drop trigger vetit_onboarding_validate_input on public.businesses;
drop function public.onboard_seller_business_v2(text,text,text,text,text,text) restrict;
drop function vetit_onboarding.guard_business_input() restrict;
drop function vetit_onboarding.validate_business(text,text,text,text,text,text) restrict;
drop schema vetit_onboarding restrict;
commit;
