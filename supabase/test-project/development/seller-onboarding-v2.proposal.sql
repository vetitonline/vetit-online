-- Forward-only proposal; separate from the frozen fourteen-step release.
-- Prerequisite: reviewed seller foundation, private-field grants and hardening.
-- No hosted execution authorized. Keep the legacy UUID RPC compatible.
begin;
create schema if not exists vetit_onboarding;
revoke all on schema vetit_onboarding from public, anon, authenticated, service_role;

create or replace function vetit_onboarding.validate_business(
 display_name text, legal_name text, business_type text,
 public_email text, public_phone text, website_url text
) returns void language plpgsql set search_path='' as $$
declare website text:=nullif(trim(website_url),''); authority text; port text;
begin
 if length(trim(coalesce(display_name,''))) not between 2 and 120
 or length(trim(coalesce(legal_name,'')))>180
 or business_type is null or business_type not in ('individual','company','clinic','farm','service_provider','other') then
  raise exception 'Invalid seller business details.' using errcode='22023';
 end if;
 if nullif(trim(public_email),'') is not null and
 (length(trim(public_email))>254 or trim(public_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
  raise exception 'Invalid public email.' using errcode='22023';
 end if;
 if nullif(trim(public_phone),'') is not null and
 (trim(public_phone) !~ '^\+?[0-9 ()-]{7,32}$' or length(regexp_replace(public_phone,'[^0-9]','','g')) not between 7 and 15) then
  raise exception 'Invalid public phone.' using errcode='22023';
 end if;
 if website is not null then
  authority:=substring(website from '(?i)^https?://([^/?#]+)');
  if length(website)>2048 or website ~ '[[:space:][:cntrl:]]' or position(chr(92) in website)>0
  or authority is null or authority !~ '^(\[[0-9A-Fa-f:.]+\]|[[:alnum:]][[:alnum:].-]*)(:[0-9]{1,5})?$' then
   raise exception 'Invalid public website; credentials are not allowed.' using errcode='22023';
  end if;
  port:=substring(authority from ':([0-9]+)$');
  if port is not null and port::integer>65535 then raise exception 'Invalid website port.' using errcode='22023';end if;
  if authority like '[%' then
   begin perform substring(authority from '^\[([^]]+)\]')::inet;
   exception when invalid_text_representation then raise exception 'Invalid website address.' using errcode='22023';end;
  end if;
 end if;
end;$$;
revoke all on function vetit_onboarding.validate_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;

-- Direct column updates must meet the same validation as RPC inserts.
create or replace function vetit_onboarding.guard_business_input()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform vetit_onboarding.validate_business(new.display_name,new.legal_name,new.business_type,new.public_email,new.public_phone,new.website_url);
 return new;
end;$$;
revoke all on function vetit_onboarding.guard_business_input() from public,anon,authenticated,service_role;
create or replace trigger vetit_onboarding_validate_input
 before insert or update of display_name,legal_name,business_type,public_email,public_phone,website_url
 on public.businesses for each row execute function vetit_onboarding.guard_business_input();

create or replace function public.onboard_seller_business_v2(
 p_display_name text,p_legal_name text,p_business_type text,
 p_public_email text,p_public_phone text,p_website_url text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare requester uuid:=auth.uid(); existing record; business_id uuid; owned_count integer:=0;
begin
 if requester is null or not exists(select 1 from auth.users u where u.id=requester) then
  raise exception 'Authenticated account required.' using errcode='42501';
 end if;
 perform vetit_onboarding.validate_business(p_display_name,p_legal_name,p_business_type,p_public_email,p_public_phone,p_website_url);
 if p_business_type not in ('individual','company','farm','other') then raise exception 'Invalid seller business type.' using errcode='22023';end if;
 insert into public.profiles(id) values(requester) on conflict(id) do nothing;
 -- Shared by both entry points: serialize same-account creation and retries.
 perform p.id from public.profiles p where p.id=requester for update;
 for existing in
  select b.id,b.is_active,b.archived_at,b.verification_status,m.membership_status
  from public.businesses b join public.business_memberships m on m.business_id=b.id
  where m.profile_id=requester and m.member_role='owner'
  order by b.id for share of b,m
 loop
  -- Never filter restricted ownership out and silently create a replacement.
  if existing.membership_status<>'active' or not existing.is_active or existing.archived_at is not null
    or existing.verification_status in ('rejected','suspended') then
   raise exception 'Existing seller ownership requires administrator review.' using errcode='42501';
  end if;
  owned_count:=owned_count+1;business_id:=existing.id;
 end loop;
 if owned_count>1 then raise exception 'Multiple owner businesses require administrator review.' using errcode='21000';end if;
 if owned_count=1 then
  -- Retry is not an edit. Never overwrite existing business/contact details.
  return jsonb_build_object('apiVersion',2,'businessId',business_id,'outcome','reused');
 end if;
 insert into public.businesses(display_name,legal_name,business_type,public_email,public_phone,website_url,country_code)
 values(trim(p_display_name),nullif(trim(p_legal_name),''),p_business_type,nullif(lower(trim(p_public_email)),''),nullif(trim(p_public_phone),''),nullif(trim(p_website_url),''),'IN') returning id into business_id;
 insert into public.business_memberships(business_id,profile_id,member_role,membership_status) values(business_id,requester,'owner','active');
 return jsonb_build_object('apiVersion',2,'businessId',business_id,'outcome','created');
end;$$;
revoke all on function public.onboard_seller_business_v2(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.onboard_seller_business_v2(text,text,text,text,text,text) to authenticated;

-- Existing clients keep UUID responses but cannot bypass the new safeguards.
create or replace function public.create_seller_business(
 p_display_name text,p_legal_name text,p_business_type text,
 p_public_email text,p_public_phone text,p_website_url text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 return (public.onboard_seller_business_v2(p_display_name,p_legal_name,p_business_type,p_public_email,p_public_phone,p_website_url)->>'businessId')::uuid;
end;$$;
revoke all on function public.create_seller_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_seller_business(text,text,text,text,text,text) to authenticated;
commit;
