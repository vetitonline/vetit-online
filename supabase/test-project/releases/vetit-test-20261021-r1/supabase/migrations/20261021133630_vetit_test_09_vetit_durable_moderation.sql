-- Test candidate step 9; requires steps 1-8. No policy or worker is enabled here.
begin;
create schema if not exists vetit_moderation;
revoke all on schema vetit_moderation from public,anon,authenticated,service_role;
-- Provisioned explicitly by the database owner; never by a client role claim.
create table if not exists vetit_moderation.reviewers (
 profile_id uuid primary key references public.profiles(id), enabled boolean not null default false
);
alter table vetit_moderation.reviewers enable row level security;
create table if not exists vetit_moderation.policies (
  id uuid primary key default gen_random_uuid(), version text not null unique check(length(version) between 1 and 80),
  subject_kind text not null check(subject_kind in ('seller','product','service')),
  market text not null references public.markets(country_code),
  category_id uuid references public.categories(id), business_type text,
  classification text not null check(classification in ('ordinary','regulated','veterinary','live_animal','prohibited')),
  automatic_eligible boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check((subject_kind='seller' and category_id is null and business_type is not null) or (subject_kind<>'seller' and category_id is not null and business_type is null))
);
create index if not exists moderation_policy_lookup on vetit_moderation.policies(subject_kind,market,category_id,business_type,created_at desc,id desc);
create table if not exists vetit_moderation.cases (
  id uuid primary key default gen_random_uuid(), subject_kind text not null check(subject_kind in ('seller','product','service')),
  subject_id uuid not null, business_id uuid not null references public.businesses(id),
  revision text not null check(revision ~ '^[0-9a-f]{64}$'), policy_id uuid references vetit_moderation.policies(id),
  is_current boolean not null default true, version bigint not null default 1 check(version>0),
  state text not null default 'pending' check(state in ('pending','screened','eligible','approved','rejected','corrections','escalated','blocked')),
  reasons text[] not null default '{}', correction text not null default '' check(length(correction)<=1000),
  approved_by uuid, approval_request uuid, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists moderation_current_subject on vetit_moderation.cases(subject_kind,subject_id) where is_current;
create index if not exists moderation_case_queue on vetit_moderation.cases(state,created_at desc,id desc) where is_current;
create index if not exists moderation_case_cursor on vetit_moderation.cases(created_at desc,id desc) where is_current;
create index if not exists moderation_case_business on vetit_moderation.cases(business_id,created_at desc,id desc);
create index if not exists moderation_case_subject_history on vetit_moderation.cases(subject_kind,subject_id,created_at desc);
create table if not exists vetit_moderation.evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references vetit_moderation.cases(id),
  policy_id uuid not null references vetit_moderation.policies(id), revision text not null,
  check_code text not null check(check_code in ('content','images','legal','credentials')),
  status text not null check(status in ('passed','failed','uncertain','unavailable')),
  issuer text not null check(issuer ~ '^[a-z0-9_-]{1,80}$'), expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists moderation_evidence_lookup on vetit_moderation.evidence(case_id,check_code,created_at desc,id desc);
create table if not exists vetit_moderation.events (
  id bigint generated always as identity primary key, case_id uuid not null references vetit_moderation.cases(id),
  request_id uuid not null unique, actor_id uuid, operation text not null,
  payload_hash text not null, from_state text, to_state text not null, reasons text[] not null default '{}',
  note text not null default '' check(length(note)<=1000), result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists moderation_events_case on vetit_moderation.events(case_id,id desc);
create or replace function vetit_moderation.policy_insert_lock() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(77190261019::bigint);return new;end;$$;
create or replace trigger moderation_policy_insert_lock before insert on vetit_moderation.policies for each row execute function vetit_moderation.policy_insert_lock();
alter table vetit_moderation.policies enable row level security;
alter table vetit_moderation.cases enable row level security;
alter table vetit_moderation.evidence enable row level security;
alter table vetit_moderation.events enable row level security;
revoke all on all tables in schema vetit_moderation from public,anon,authenticated,service_role;
revoke all on all sequences in schema vetit_moderation from public,anon,authenticated,service_role;

create or replace function vetit_moderation.immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Moderation history is append-only.' using errcode='42501';end;$$;
create or replace trigger moderation_policy_immutable before update or delete on vetit_moderation.policies for each row execute function vetit_moderation.immutable_record();
create or replace trigger moderation_evidence_immutable before update or delete on vetit_moderation.evidence for each row execute function vetit_moderation.immutable_record();
create or replace trigger moderation_events_immutable before update or delete on vetit_moderation.events for each row execute function vetit_moderation.immutable_record();

create or replace function vetit_moderation.is_admin() returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'vetit_admin','false')='true' and exists(select 1 from vetit_moderation.reviewers where profile_id=auth.uid() and enabled);$$;
-- Global lock order: business, listing/storage, case. Existing catalog RPCs lock
-- business SHARE before listing; FOR UPDATE here serializes screening with them.
create or replace function vetit_moderation.lock_subject(k text,s uuid) returns uuid language plpgsql set search_path='' as $$
declare b uuid;
begin
 perform pg_advisory_xact_lock_shared(77190261019::bigint);
 if k='seller' then b:=s;
 elsif k in ('product','service') then select business_id into b from public.listings where id=s and kind=k and archived_at is null;
 else raise exception 'Invalid subject.' using errcode='22023';end if;
 perform id from public.businesses where id=b and archived_at is null for update;
 if not found then raise exception 'Subject unavailable.' using errcode='42501';end if;
 perform business_id from public.provider_profiles where business_id=b for share;
 if k<>'seller' then
   perform id from public.listings where id=s and business_id=b and kind=k and archived_at is null for update;
   if not found then raise exception 'Subject unavailable.' using errcode='42501';end if;
   perform o.name from storage.objects o join public.listing_images i on i.storage_object_path=o.name where i.listing_id=s and o.bucket_id='listing-images' for share of o;
   perform category_id from public.listings l join public.categories cat on cat.id=l.category_id where l.id=s for share of cat;
   perform id from public.animal_species where id in(select species_id from public.listing_species where listing_id=s) for share;
   perform country_code from public.markets where country_code='IN' for share;
   if k='service' then
     perform listing_id from public.service_offerings where listing_id=s for share;
     perform loc.id from public.provider_locations loc join public.service_offerings so on so.provider_location_id=loc.id where so.listing_id=s for share of loc;
   end if;
 end if;
 return b;
end;$$;
create or replace function vetit_moderation.authorize(b uuid,admin_only boolean default false) returns void language plpgsql set search_path='' as $$
begin
 if vetit_moderation.is_admin() then
   perform profile_id from vetit_moderation.reviewers where profile_id=auth.uid() and enabled for share;
   if found then return;end if;
 end if;
 if auth.uid() is null or admin_only then raise exception 'Moderator access required.' using errcode='42501';end if;
 perform profile_id from public.business_memberships where business_id=b and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager') for share;
 if not found then raise exception 'Subject access denied.' using errcode='42501';end if;
end;$$;
create or replace function vetit_moderation.fingerprint(k text,s uuid) returns text language sql stable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'business',(select to_jsonb(b)-array['verification_status','updated_at','created_at'] from public.businesses b where b.id=case when k='seller' then s else (select business_id from public.listings where id=s) end),
 'listing',(select to_jsonb(l)-array['moderation_status','moderated_by','moderated_at','updated_at','created_at'] from public.listings l where l.id=s and k<>'seller'),
 'markets',(select jsonb_agg(to_jsonb(m)-'compliance_status' order by m.market_code) from public.listing_markets m where m.listing_id=s and k<>'seller'),
 'species',(select jsonb_agg(to_jsonb(x) order by x.species_id) from public.listing_species x where x.listing_id=s and k<>'seller'),
 'prices',(select jsonb_agg(to_jsonb(x) order by x.id) from public.listing_prices x where x.listing_id=s and k<>'seller'),
 'variants',(select jsonb_agg(to_jsonb(x) order by x.id) from public.product_variants x where x.listing_id=s and k<>'seller'),
 'images',(select jsonb_agg(jsonb_build_object('image',to_jsonb(i),'object',to_jsonb(o)) order by i.id) from public.listing_images i left join storage.objects o on o.bucket_id='listing-images' and o.name=i.storage_object_path where i.listing_id=s and k<>'seller'),
 'service',(select to_jsonb(x) from public.service_offerings x where x.listing_id=s and k='service'),
 'provider',(select to_jsonb(x) from public.provider_profiles x where x.business_id=case when k='seller' then s else (select business_id from public.listings where id=s) end)
 )::text,'UTF8')),'hex');$$;
create or replace function vetit_moderation.policy_for(k text,s uuid) returns uuid language sql stable set search_path='' as $$
 select p.id from vetit_moderation.policies p join public.businesses b on b.id=case when k='seller' then s else (select business_id from public.listings where id=s) end
 where p.subject_kind=k and p.market=b.country_code and (case when k='seller' then p.business_type=b.business_type else p.category_id=(select category_id from public.listings where id=s) end)
 order by p.created_at desc,p.id desc limit 1;$$;

-- Recomputed by screening AND approval; advisory client results are never inputs.
create or replace function vetit_moderation.reasons_for(c vetit_moderation.cases) returns text[] language plpgsql set search_path='' as $$
declare reasons text[]:='{}'; p vetit_moderation.policies%rowtype; b public.businesses%rowtype; l public.listings%rowtype; code text; evidence_status text; regulated boolean:=false;
begin
 select * into b from public.businesses where id=c.business_id;
 select * into p from vetit_moderation.policies where id=c.policy_id;
 if p.id is null or c.policy_id is distinct from vetit_moderation.policy_for(c.subject_kind,c.subject_id) then return array['POLICY_UNAVAILABLE'];end if;
 if c.revision<>vetit_moderation.fingerprint(c.subject_kind,c.subject_id) then return array['STALE_REVISION'];end if;
 if not b.is_active or b.archived_at is not null or b.country_code<>p.market then reasons:=array_append(reasons,'BUSINESS_INACTIVE');end if;
 if not exists(select 1 from public.markets where country_code=p.market and market_status='active' and currency_code='INR') or p.market<>'IN' then reasons:=array_append(reasons,'MARKET_NOT_ELIGIBLE');end if;
 if p.classification='prohibited' then reasons:=array_append(reasons,'PROHIBITED');end if;
 regulated:=p.classification in ('regulated','veterinary','live_animal') or exists(select 1 from public.provider_profiles where business_id=b.id and provider_type in ('veterinary_clinic','veterinarian','livestock_provider')) or b.business_type='clinic';
 if regulated then reasons:=array_append(reasons,'HUMAN_REVIEW_REQUIRED');end if;
 if exists(select 1 from public.businesses other where other.id<>b.id and other.archived_at is null and other.country_code=b.country_code and lower(trim(coalesce(nullif(other.legal_name,''),other.display_name)))=lower(trim(coalesce(nullif(b.legal_name,''),b.display_name)))) then reasons:=array_append(reasons,'DUPLICATE_BUSINESS');end if;
 if c.subject_kind='seller' then
   if length(trim(b.display_name))<2 or coalesce(trim(b.public_email),'')='' and coalesce(trim(b.public_phone),'')='' then reasons:=array_append(reasons,'APPLICATION_INCOMPLETE');end if;
   if not exists(select 1 from public.business_memberships m join public.profiles u on u.id=m.profile_id where m.business_id=b.id and m.member_role='owner' and m.membership_status='active') then reasons:=array_append(reasons,'OWNER_REQUIRED');end if;
 else
   select * into l from public.listings where id=c.subject_id;
   if b.verification_status<>'verified' then reasons:=array_append(reasons,'SELLER_NOT_VERIFIED');end if;
   if not exists(select 1 from public.categories where id=l.category_id and moderation_status='active' and kind in (c.subject_kind,'both')) then reasons:=array_append(reasons,'CATEGORY_NOT_ELIGIBLE');end if;
   if (select count(*) from public.listing_species where listing_id=l.id) not between 1 and 8 or exists(select 1 from public.listing_species s join public.animal_species a on a.id=s.species_id where s.listing_id=l.id and not a.is_active) or (exists(select 1 from public.category_species where category_id=l.category_id) and exists(select 1 from public.listing_species s where s.listing_id=l.id and not exists(select 1 from public.category_species cs where cs.category_id=l.category_id and cs.species_id=s.species_id))) then reasons:=array_append(reasons,'SPECIES_NOT_ELIGIBLE');end if;
   if exists(select 1 from public.listings x where x.id<>l.id and x.business_id=b.id and x.category_id=l.category_id and x.kind=l.kind and x.archived_at is null and x.moderation_status in ('submitted','published') and lower(trim(x.title))=lower(trim(l.title))) then reasons:=array_append(reasons,'DUPLICATE_LISTING');end if;
   if not exists(select 1 from public.listing_markets where listing_id=l.id and market_code=p.market and availability_status='available') then reasons:=array_append(reasons,'LISTING_MARKET_REQUIRED');end if;
   if not exists(select 1 from public.listing_prices where listing_id=l.id and market_code=p.market and currency_code='INR' and status='active' and amount_minor>0 and valid_from<=now() and (valid_to is null or valid_to>now())) then reasons:=array_append(reasons,'PRICE_REQUIRED');end if;
   if not exists(select 1 from public.product_variants where listing_id=l.id and active_status) then
     if (select count(*) from public.listing_prices where listing_id=l.id and product_variant_id is null and market_code=p.market and currency_code='INR' and status='active' and amount_minor>0 and valid_from<=now() and (valid_to is null or valid_to>now()))<>1 then reasons:=array_append(reasons,'PRICE_NOT_UNIQUE');end if;
   elsif exists(select 1 from public.product_variants v where v.listing_id=l.id and v.active_status and (select count(*) from public.listing_prices pr where pr.listing_id=l.id and pr.product_variant_id=v.id and pr.market_code=p.market and pr.currency_code='INR' and pr.status='active' and pr.amount_minor>0 and pr.valid_from<=now() and (pr.valid_to is null or pr.valid_to>now()))<>1) then reasons:=array_append(reasons,'VARIANT_PRICE_NOT_UNIQUE');end if;
   if not exists(select 1 from public.listing_images where listing_id=l.id and visibility_status='visible') or exists(select 1 from public.listing_images i where i.listing_id=l.id and not exists(select 1 from storage.objects o where o.bucket_id='listing-images' and o.name=i.storage_object_path)) then reasons:=array_append(reasons,'IMAGES_REQUIRED');end if;
   if c.subject_kind='service' and not exists(select 1 from public.service_offerings s join public.provider_profiles pp on pp.business_id=b.id where s.listing_id=l.id and s.duration_minutes is not null and (s.delivery_mode='remote' or exists(select 1 from public.provider_locations loc where loc.id=s.provider_location_id and loc.business_id=b.id and loc.is_active and loc.country_code=p.market))) then reasons:=array_append(reasons,'SERVICE_DETAILS_REQUIRED');end if;
   if regulated and exists(select 1 from public.provider_profiles where business_id=b.id and credential_verification_status<>'verified') then reasons:=array_append(reasons,'PROVIDER_CREDENTIALS_REQUIRED');end if;
 end if;
 foreach code in array case when c.subject_kind='seller' then array['content','legal'] else array['content','legal','images'] end || case when regulated then array['credentials'] else '{}'::text[] end loop
   select case when e.expires_at>clock_timestamp() then e.status else 'unavailable' end into evidence_status from vetit_moderation.evidence e where e.case_id=c.id and e.policy_id=p.id and e.revision=c.revision and e.check_code=code order by e.created_at desc,e.id desc limit 1;
   if evidence_status is distinct from 'passed' then reasons:=array_append(reasons,upper(code)||'_NOT_PASSED');end if;
 end loop;
 return reasons;
end;$$;

create or replace function public.moderation_open(p_kind text,p_subject uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid; c vetit_moderation.cases%rowtype; rev text; status text;
begin
 b:=vetit_moderation.lock_subject(p_kind,p_subject);perform vetit_moderation.authorize(b);
 if not exists(select 1 from public.businesses where id=b and is_active) then raise exception 'Inactive business.' using errcode='42501';end if;
 if p_kind<>'seller' then
   select moderation_status into status from public.listings where id=p_subject;
   if status in ('draft','rejected') then
     -- Only an active catalog member can submit, even when also an administrator.
     if not exists(select 1 from public.business_memberships where business_id=b and profile_id=auth.uid() and member_role in ('owner','admin','catalog_manager') and membership_status='active') then raise exception 'Seller submission required.' using errcode='42501';end if;
     if p_kind='product' then perform public.submit_seller_product(b,p_subject);
     else
       perform set_config('vetit.seller_action','submit',true);
       update public.listings set moderation_status='submitted',moderated_by=null,moderated_at=null,updated_at=now() where id=p_subject;
     end if;
   elsif status<>'submitted' then raise exception 'Only submitted listings can open review.' using errcode='22023';end if;
 elsif exists(select 1 from public.businesses where id=b and verification_status not in ('pending','rejected')) then raise exception 'Seller application is not pending.' using errcode='22023';end if;
 rev:=vetit_moderation.fingerprint(p_kind,p_subject);
 select * into c from vetit_moderation.cases where subject_kind=p_kind and subject_id=p_subject and is_current for update;
 if c.id is not null and c.revision=rev and c.policy_id is not distinct from vetit_moderation.policy_for(p_kind,p_subject) and c.state not in ('rejected','corrections') then return jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state);end if;
 update vetit_moderation.cases set is_current=false where id=c.id;
 insert into vetit_moderation.cases(subject_kind,subject_id,business_id,revision,policy_id) values(p_kind,p_subject,b,rev,vetit_moderation.policy_for(p_kind,p_subject)) returning * into c;
 insert into vetit_moderation.events(case_id,request_id,actor_id,operation,payload_hash,to_state,result) values(c.id,gen_random_uuid(),auth.uid(),'submit',rev,c.state,jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state));
 return jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state);
end;$$;

-- Only the trusted service role can attest. Authenticated/admin clients cannot
-- forge provider success. The worker must verify bytes/legal credentials itself.
create or replace function public.moderation_attest(p_case uuid,p_revision text,p_policy uuid,p_check text,p_status text,p_issuer text,p_expires timestamptz,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; h text; previous vetit_moderation.events%rowtype; result jsonb;
begin
 select * into c from vetit_moderation.cases where id=p_case;
 if c.id is null then raise exception 'Case unavailable.' using errcode='42501';end if;
 perform vetit_moderation.lock_subject(c.subject_kind,c.subject_id);
 select * into c from vetit_moderation.cases where id=p_case for update;
 h:=encode(sha256(convert_to(jsonb_build_array(p_case,p_revision,p_policy,p_check,p_status,p_issuer,p_expires)::text,'UTF8')),'hex');
 select * into previous from vetit_moderation.events where request_id=p_request;
 if found then if previous.actor_id is not null or previous.operation<>'attest' or previous.payload_hash<>h then raise exception 'Idempotency key conflict.' using errcode='22023';end if;return previous.result;end if;
 if not c.is_current or c.state not in ('pending','screened','eligible','escalated','blocked') or p_revision is distinct from c.revision or p_policy is distinct from c.policy_id or p_policy is distinct from vetit_moderation.policy_for(c.subject_kind,c.subject_id) or c.revision<>vetit_moderation.fingerprint(c.subject_kind,c.subject_id) then raise exception 'Stale evidence.' using errcode='40001';end if;
 if p_request is null or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '24 hours' then raise exception 'Invalid evidence expiry.' using errcode='22023';end if;
 insert into vetit_moderation.evidence(case_id,policy_id,revision,check_code,status,issuer,expires_at) values(c.id,p_policy,p_revision,p_check,p_status,p_issuer,p_expires);
 update vetit_moderation.cases set version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 result:=jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state);
 insert into vetit_moderation.events(case_id,request_id,operation,payload_hash,from_state,to_state,result) values(c.id,p_request,'attest',h,c.state,c.state,result);
 return result;
end;$$;

create or replace function public.moderation_decide(p_case uuid,p_version bigint,p_action text,p_request uuid,p_reasons text[] default '{}',p_note text default '',p_correction text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; previous vetit_moderation.events%rowtype; h text; checks text[]; result jsonb; old_state text; next_state text; automatic boolean;
begin
 select * into c from vetit_moderation.cases where id=p_case;
 if c.id is null then raise exception 'Case unavailable.' using errcode='42501';end if;
 perform vetit_moderation.lock_subject(c.subject_kind,c.subject_id);
 perform vetit_moderation.authorize(c.business_id,p_action<>'screen');
 select * into c from vetit_moderation.cases where id=p_case for update;
 if p_action is null or p_action not in ('screen','approve','reject','corrections','escalate') or p_request is null or p_version is null or p_reasons is null or cardinality(p_reasons)>10 or p_note is null or length(p_note)>1000 or p_correction is null or length(p_correction)>1000 or exists(select 1 from unnest(p_reasons) x where x is null or x !~ '^[A-Z][A-Z0-9_]{1,63}$') then raise exception 'Invalid moderation command.' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_case,p_version,p_action,p_reasons,p_note,p_correction)::text,'UTF8')),'hex');
 select * into previous from vetit_moderation.events where request_id=p_request;
 if found then if previous.actor_id is distinct from auth.uid() or previous.payload_hash<>h then raise exception 'Idempotency key conflict.' using errcode='22023';end if;return previous.result;end if;
 if not c.is_current or c.version<>p_version then raise exception 'Case changed; refresh.' using errcode='40001';end if;
 if c.state in ('approved','rejected','corrections') then raise exception 'Decision is final for this submission.' using errcode='40001';end if;
 if c.revision<>vetit_moderation.fingerprint(c.subject_kind,c.subject_id) then raise exception 'Content changed; resubmit.' using errcode='40001';end if;
 old_state:=c.state;
 if p_action='screen' then
   checks:=vetit_moderation.reasons_for(c);
   select automatic_eligible into automatic from vetit_moderation.policies where id=c.policy_id;
   next_state:=case when 'PROHIBITED'=any(checks) then 'blocked' when cardinality(checks)=0 and coalesce(automatic,false) then 'eligible' else 'screened' end;
 else
   if p_action='approve' then
     if exists(select 1 from public.business_memberships where business_id=c.business_id and profile_id=auth.uid() and membership_status='active') then raise exception 'Self approval denied.' using errcode='42501';end if;
     checks:=array_remove(vetit_moderation.reasons_for(c),'HUMAN_REVIEW_REQUIRED');
     if cardinality(checks)>0 then raise exception 'Mandatory screening has not passed.' using errcode='42501';end if;
     if c.state not in ('screened','eligible','escalated') then raise exception 'Screen first.' using errcode='22023';end if;
   elsif cardinality(p_reasons)=0 or p_action='corrections' and length(trim(p_correction))=0 then raise exception 'Explain the decision.' using errcode='22023';end if;
   checks:=p_reasons; next_state:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'corrections' then 'corrections' else 'escalated' end;
 end if;
 update vetit_moderation.cases set state=next_state,reasons=checks,correction=p_correction,version=version+1,updated_at=clock_timestamp(),approved_by=case when p_action='approve' then auth.uid() else null end,approval_request=case when p_action='approve' then p_request else null end where id=c.id returning * into c;
 result:=jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',c.reasons);
 insert into vetit_moderation.events(case_id,request_id,actor_id,operation,payload_hash,from_state,to_state,reasons,note,result) values(c.id,p_request,auth.uid(),p_action,h,old_state,c.state,c.reasons,p_note,result);
 if p_action in ('approve','reject','corrections') then
   if c.subject_kind='seller' then perform public.review_seller_business(c.subject_id,case when p_action='approve' then 'verified' else 'rejected' end);
   elsif c.subject_kind='product' then perform public.review_seller_listing(c.subject_id,case when p_action='approve' then 'publish' else 'reject' end);
   else
     perform set_config('vetit.seller_action','moderation',true);
     update public.listing_markets set compliance_status=case when p_action='approve' then 'approved' else 'rejected' end where listing_id=c.subject_id and market_code='IN';
     update public.listings set moderation_status=case when p_action='approve' then 'published' else 'rejected' end,moderated_by=auth.uid(),moderated_at=now(),updated_at=now() where id=c.subject_id;
   end if;
 end if;
 return result;
end;$$;

-- Every existing and future publication/verification path must carry an audited,
-- current approval. A forgeable custom GUC is deliberately not sufficient.
create or replace function vetit_moderation.publication_gate() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; s uuid; c vetit_moderation.cases%rowtype; approving boolean;
begin
 if tg_table_name='businesses' then
   if new.verification_status not in ('verified','rejected') or tg_op='UPDATE' and old.verification_status=new.verification_status then return new;end if;
   k:='seller';s:=new.id;approving:=new.verification_status='verified';
 else
   if new.moderation_status not in ('published','rejected') then return new;end if;
   if tg_op='UPDATE' and old.moderation_status=new.moderation_status then return new;end if;
   k:=new.kind;s:=new.id;approving:=new.moderation_status='published';
 end if;
 select * into c from vetit_moderation.cases where subject_kind=k and subject_id=s and is_current;
 if not vetit_moderation.is_admin() or c.id is null or c.revision<>vetit_moderation.fingerprint(k,s) then raise exception 'Current audited moderation required.' using errcode='42501';end if;
 if approving then
 if c.state<>'approved' or c.approved_by is distinct from auth.uid() or cardinality(array_remove(vetit_moderation.reasons_for(c),'HUMAN_REVIEW_REQUIRED'))>0 or not exists(select 1 from vetit_moderation.events where case_id=c.id and request_id=c.approval_request and operation='approve') then
   raise exception 'A current audited moderation approval is required.' using errcode='42501';
 end if;
 elsif c.state not in ('rejected','corrections') or not exists(select 1 from vetit_moderation.events where case_id=c.id and actor_id=auth.uid() and operation in ('reject','corrections') and to_state=c.state) then raise exception 'Audited rejection required.' using errcode='42501';end if;
 return new;
end;$$;
create or replace trigger moderation_publication_gate before insert or update on public.listings for each row execute function vetit_moderation.publication_gate();
create or replace trigger moderation_verification_gate before insert or update on public.businesses for each row execute function vetit_moderation.publication_gate();

create or replace function public.moderation_status(p_kind text,p_subject uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; b uuid; result jsonb;
begin
 select * into c from vetit_moderation.cases where subject_kind=p_kind and subject_id=p_subject and is_current;
 if c.id is null then
   select case when p_kind='seller' then p_subject else (select business_id from public.listings where id=p_subject and kind=p_kind) end into b;
 else b:=c.business_id;end if;
 -- Read-only authorization; no FOR SHARE is used in this stable reader.
 if auth.uid() is null or not vetit_moderation.is_admin() and not exists(select 1 from public.business_memberships where business_id=b and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager')) then raise exception 'Subject access denied.' using errcode='42501';end if;
 if c.id is null then return jsonb_build_object('case',null,'events','[]'::jsonb);end if;
 select jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',c.reasons,'correction',c.correction,'revision',c.revision,'policyId',c.policy_id,'policyVersion',p.version,'updatedAt',c.updated_at),
 'events',coalesce((select jsonb_agg(x.event order by x.id desc) from (select e.id,jsonb_build_object('id',e.id,'operation',e.operation,'state',e.to_state,'reasons',e.reasons,'at',e.created_at,'reviewer',case when vetit_moderation.is_admin() then e.actor_id end,'note',case when vetit_moderation.is_admin() then e.note end) event from vetit_moderation.events e where e.case_id in(select history.id from vetit_moderation.cases history where history.subject_kind=c.subject_kind and history.subject_id=c.subject_id) order by e.id desc limit 50) x),'[]'::jsonb)) into result from (select c.policy_id id) source left join vetit_moderation.policies p on p.id=source.id;
 if result is null then return jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',array['POLICY_UNAVAILABLE'],'correction',c.correction),'events','[]'::jsonb);end if;
 return result;
end;$$;

revoke all on all functions in schema vetit_moderation from public,anon,authenticated,service_role;
revoke all on function public.moderation_open(text,uuid),public.moderation_decide(uuid,bigint,text,uuid,text[],text,text),public.moderation_status(text,uuid),public.moderation_attest(uuid,text,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.moderation_open(text,uuid),public.moderation_decide(uuid,bigint,text,uuid,text[],text,text),public.moderation_status(text,uuid) to authenticated;
grant execute on function public.moderation_attest(uuid,text,uuid,text,text,text,timestamptz,uuid) to service_role;

create or replace function vetit_moderation.service_child_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s uuid; b uuid; status text;
begin
 if tg_op='UPDATE' and new.listing_id is distinct from old.listing_id then raise exception 'Service parent is immutable.' using errcode='42501';end if;
 if tg_op='DELETE' then s:=old.listing_id;else s:=new.listing_id;end if;
 b:=vetit_moderation.lock_subject('service',s);perform vetit_moderation.authorize(b);
 select moderation_status into status from public.listings where id=s;
 if status not in ('draft','rejected') then raise exception 'Submitted/published service details are locked.' using errcode='42501';end if;
 if tg_op<>'DELETE' and new.provider_location_id is not null and not exists(select 1 from public.provider_locations where id=new.provider_location_id and business_id=b and is_active) then raise exception 'Provider location belongs to another business.' using errcode='42501';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end;$$;
create or replace trigger moderation_service_details_guard before insert or update or delete on public.service_offerings for each row execute function vetit_moderation.service_child_guard();
revoke all on function vetit_moderation.service_child_guard() from public,anon,authenticated,service_role;

create or replace function public.save_seller_service(p_listing uuid,p_business uuid,p_title text,p_slug text,p_description text,p_category uuid,p_species uuid[],p_price bigint,p_duration integer,p_location uuid,p_delivery text default 'at_provider') returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 perform vetit_moderation.lock_subject('seller',p_business);
 -- Admin claim does not substitute for active seller membership on a save.
 if auth.uid() is null or not exists(select 1 from public.business_memberships where business_id=p_business and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager')) then raise exception 'Seller catalog access required.' using errcode='42501';end if;
 if not exists(select 1 from public.businesses where id=p_business and is_active and archived_at is null) then raise exception 'Inactive business.' using errcode='42501';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 160 or length(coalesce(p_description,''))>5000 or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>100 or p_price is null or p_price not between 1 and 99999999 or p_duration is null or p_duration not between 5 and 1440 or p_delivery is null or p_delivery not in ('at_provider','mobile','remote','farm_visit') then raise exception 'Invalid service details.' using errcode='22023';end if;
 if not exists(select 1 from public.categories where id=p_category and kind in ('service','both') and moderation_status='active') or cardinality(p_species) is null or cardinality(p_species) not between 1 and 8 or exists(select 1 from unnest(p_species) x where x is null or not exists(select 1 from public.animal_species where id=x and is_active)) or (exists(select 1 from public.category_species where category_id=p_category) and exists(select 1 from unnest(p_species) x where not exists(select 1 from public.category_species where category_id=p_category and species_id=x))) then raise exception 'Invalid service taxonomy.' using errcode='22023';end if;
 if p_location is not null and not exists(select 1 from public.provider_locations where id=p_location and business_id=p_business and is_active and country_code='IN') or p_delivery<>'remote' and p_location is null then raise exception 'Owned active service location required.' using errcode='42501';end if;
 if p_listing is null then
   perform set_config('vetit.seller_action','save_service',true);
   insert into public.listings(business_id,category_id,kind,title,slug,description) values(p_business,p_category,'service',trim(p_title),p_slug,p_description) returning id into s;
 else
   if not exists(select 1 from public.listings where id=p_listing and business_id=p_business and kind='service' and moderation_status in ('draft','rejected') and archived_at is null) then raise exception 'Service draft access denied.' using errcode='42501';end if;
   perform vetit_moderation.lock_subject('service',p_listing);
   s:=p_listing;perform set_config('vetit.seller_action','save',true);
   update public.listings set title=trim(p_title),slug=p_slug,description=p_description,category_id=p_category,updated_at=now() where id=s;
 end if;
 perform set_config('vetit.seller_action','save',true);
 insert into public.service_offerings(listing_id,provider_location_id,delivery_mode,duration_minutes) values(s,p_location,p_delivery,p_duration) on conflict(listing_id) do update set provider_location_id=excluded.provider_location_id,delivery_mode=excluded.delivery_mode,duration_minutes=excluded.duration_minutes,updated_at=now();
 insert into public.listing_markets(listing_id,market_code,availability_status) values(s,'IN','available') on conflict(listing_id,market_code) do nothing;
 delete from public.listing_species where listing_id=s;
 insert into public.listing_species(listing_id,species_id) select s,x from unnest(p_species) x group by x;
 update public.listing_prices set status='inactive' where listing_id=s and status='active';
 insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor,status) values(s,'IN','INR',p_price,'active');
 return s;
end;$$;
revoke all on function public.save_seller_service(uuid,uuid,text,text,text,uuid,uuid[],bigint,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_seller_service(uuid,uuid,text,text,text,uuid,uuid[],bigint,integer,uuid,text) to authenticated;

create or replace function public.reserve_seller_service_image(p_listing uuid,p_object uuid,p_extension text) returns text language plpgsql security definer set search_path='' as $$
declare b uuid; path text;
begin
 b:=vetit_moderation.lock_subject('service',p_listing);
 if auth.uid() is null or not exists(select 1 from public.business_memberships where business_id=b and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager')) then raise exception 'Seller access required.' using errcode='42501';end if;
 if p_object is null or p_extension is null or p_extension not in ('jpg','jpeg','png','webp','avif') or not exists(select 1 from public.listings where id=p_listing and moderation_status in ('draft','rejected')) then raise exception 'Invalid service image reservation.' using errcode='22023';end if;
 path:=b::text||'/'||p_listing::text||'/'||p_object::text||'.'||p_extension;
 if exists(select 1 from public.listing_images where listing_id=p_listing and storage_object_path=path) then return path;end if;
 perform set_config('vetit.seller_action','save',true);
 insert into public.listing_images(listing_id,storage_object_path) values(p_listing,path);
 return path;
end;$$;
revoke all on function public.reserve_seller_service_image(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_seller_service_image(uuid,uuid,text) to authenticated;

-- Exact reserved canonical paths, active membership, and draft/rejected parents.
-- No service UPDATE/upsert policy: byte replacement requires a new reservation.
create or replace function public.can_write_service_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id join public.business_memberships m on m.business_id=b.id
 where i.storage_object_path=p_path and public.seller_image_path_is_canonical(p_path,b.id,l.id) and l.kind='service' and l.moderation_status in ('draft','rejected') and l.archived_at is null and b.is_active and b.archived_at is null and m.profile_id=auth.uid() and m.membership_status='active' and m.member_role in ('owner','admin','catalog_manager'));$$;
revoke all on function public.can_write_service_image(text) from public,anon,authenticated,service_role;
grant execute on function public.can_write_service_image(text) to authenticated;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vetit_service_image_insert') then
 create policy vetit_service_image_insert on storage.objects for insert to authenticated with check(bucket_id='listing-images' and public.can_write_service_image(name));end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vetit_service_image_delete') then
 create policy vetit_service_image_delete on storage.objects for delete to authenticated using(bucket_id='listing-images' and public.can_write_service_image(name));end if;
end;$$;

-- Preserve step-7 guard; extend only authorized service draft insertion.
create or replace function public.guard_seller_catalog_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  is_vetit_admin boolean := coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false);
  seller_action text := coalesce(current_setting('vetit.seller_action', true), '');
  parent_id uuid;
  parent_business_id uuid;
  parent_status text;
  parent_archived timestamptz;
  business_active boolean;
  business_archived timestamptz;
  role_allowed boolean;
  image_count integer;
  allow_submitted_image_cleanup boolean := false;
begin
  if tg_table_name = 'businesses' then
    if new.business_type is distinct from old.business_type
       or new.country_code is distinct from old.country_code
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Seller profile type, market and archive state are controlled by Vetit.' using errcode = '42501';
    end if;
    if (new.verification_status is distinct from old.verification_status or new.is_active is distinct from old.is_active)
       and (not is_vetit_admin or seller_action <> 'business_moderation') then
      raise exception 'Use the Vetit business review operation to change verification.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      if not ((seller_action = 'save' and new.kind = 'product') or (seller_action = 'save_service' and new.kind = 'service')) or new.moderation_status <> 'draft'
         or new.moderated_by is not null or new.moderated_at is not null then
        raise exception 'Listings must be created as seller product drafts through the seller operation.' using errcode = '42501';
      end if;
      parent_id := new.id;
      parent_business_id := new.business_id;
    else
      parent_id := old.id;
      parent_business_id := old.business_id;
      if new.id is distinct from old.id or new.business_id is distinct from old.business_id
         or new.kind is distinct from old.kind or new.archived_at is distinct from old.archived_at then
        raise exception 'Listing identity, business, kind and archive state are immutable through seller operations.' using errcode = '42501';
      end if;
      if (new.category_id is distinct from old.category_id or new.title is distinct from old.title
          or new.slug is distinct from old.slug or new.description is distinct from old.description)
         and seller_action <> 'save' then
        raise exception 'Listing content must be changed through the seller draft operation.' using errcode = '42501';
      end if;
      if new.moderated_by is distinct from old.moderated_by or new.moderated_at is distinct from old.moderated_at then
        -- Only the scoped, authorized resubmission transition may clear old review metadata.
        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected')
           and new.moderation_status = 'submitted'
           and new.moderated_by is null and new.moderated_at is null then
          null;
        elsif not is_vetit_admin or seller_action <> 'moderation' then
          raise exception 'Only the scoped Vetit moderation operation can change review metadata.' using errcode = '42501';
        end if;
      end if;
      if new.moderation_status is distinct from old.moderation_status then
        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected') and new.moderation_status = 'submitted'
           and new.moderated_by is null and new.moderated_at is null then
          null;
        elsif seller_action = 'moderation' and is_vetit_admin and old.moderation_status = 'submitted'
           and new.moderation_status in ('published', 'rejected') then
          null;
        else
          raise exception 'Use submit_seller_product or the scoped Vetit review operation to change listing status.' using errcode = '42501';
        end if;
      elsif old.moderation_status in ('submitted', 'published') and seller_action = 'save' then
        raise exception 'Products in review or published cannot be edited by sellers.' using errcode = '42501';
      end if;
      if old.moderation_status in ('submitted', 'published')
         and (new.category_id is distinct from old.category_id or new.title is distinct from old.title
              or new.slug is distinct from old.slug or new.description is distinct from old.description) then
        raise exception 'Products in review or published cannot be edited by sellers.' using errcode = '42501';
      end if;
    end if;

    select b.is_active, b.archived_at into business_active, business_archived
    from public.businesses b where b.id = parent_business_id for share;
    if not found or not business_active or business_archived is not null then
      raise exception 'The seller profile is inactive.' using errcode = '42501';
    end if;
    if seller_action <> 'moderation' then
      select exists (
        select 1 from public.business_memberships m where m.business_id = parent_business_id and m.profile_id = requester_id
          and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
      ) into role_allowed;
      if not role_allowed then raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501'; end if;
    elsif not is_vetit_admin then
      raise exception 'Vetit administrator access is required.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then parent_id := old.listing_id; else parent_id := new.listing_id; end if;
  if tg_op = 'UPDATE' and (new.listing_id is distinct from old.listing_id) then
    raise exception 'A catalogue record cannot be moved to another listing.' using errcode = '42501';
  end if;

  -- Serialize child mutations against submit/moderation on the parent listing.
  select l.business_id into parent_business_id from public.listings l where l.id = parent_id;
  if not found then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  select b.is_active, b.archived_at into business_active, business_archived
  from public.businesses b where b.id = parent_business_id for share;
  if not found or not business_active or business_archived is not null then raise exception 'Seller profile is inactive.' using errcode = '42501'; end if;
  if seller_action = 'moderation' and is_vetit_admin and tg_table_name = 'listing_markets' then
    role_allowed := true;
  else
    select exists (
      select 1 from public.business_memberships m where m.business_id = parent_business_id and m.profile_id = requester_id
        and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    ) into role_allowed;
  end if;
  if not role_allowed then raise exception 'You do not have catalog access to this product.' using errcode = '42501'; end if;

  select l.moderation_status, l.archived_at into parent_status, parent_archived
  from public.listings l where l.id = parent_id for update;
  if not found or parent_archived is not null then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  -- Keep image-specific fields behind a table/op check: trigger records have
  -- different shapes, so referencing OLD.storage_object_path in the shared
  -- predicate can fail on unrelated child-table operations.
  if tg_table_name = 'listing_images' and tg_op = 'DELETE' and parent_status = 'submitted' then
    select not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'listing-images' and o.name = old.storage_object_path
    ) into allow_submitted_image_cleanup;
  end if;
  if parent_status not in ('draft', 'rejected')
     and not (tg_table_name = 'listing_markets' and seller_action = 'moderation' and is_vetit_admin and parent_status = 'submitted')
     and not allow_submitted_image_cleanup then
    raise exception 'Only draft or rejected products can be changed.' using errcode = '42501';
  end if;

  if tg_table_name = 'listing_images' then
    if tg_op = 'INSERT' then
      if not public.seller_image_path_is_canonical(new.storage_object_path, parent_business_id, parent_id) then
        raise exception 'Product image paths must use the canonical seller/listing/UUID path.' using errcode = '22023';
      end if;
      if new.visibility_status is distinct from 'visible' or length(coalesce(new.alt_text, '')) > 500 then
        raise exception 'Product photos must be visible catalogue images with a description under 500 characters.' using errcode = '22023';
      end if;
      select count(*) into image_count from public.listing_images li where li.listing_id = parent_id;
      if image_count >= 5 then raise exception 'A product can have at most five images.' using errcode = '22023'; end if;
      new.sort_order := coalesce((select max(li.sort_order) from public.listing_images li where li.listing_id = parent_id), -1) + 1;
    elsif tg_op = 'UPDATE' then
      if new.storage_object_path is distinct from old.storage_object_path then
        raise exception 'Product image object paths are immutable.' using errcode = '42501';
      end if;
      if new.visibility_status is distinct from old.visibility_status then
        raise exception 'Only Vetit moderation can change product image visibility.' using errcode = '42501';
      end if;
      if length(coalesce(new.alt_text, '')) > 500 then raise exception 'Image description is too long.' using errcode = '22023'; end if;
    end if;
  elsif seller_action <> 'save' and not (tg_table_name = 'listing_markets' and seller_action = 'moderation' and is_vetit_admin) then
    raise exception 'Catalogue records must be changed through the scoped seller operation.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_seller_catalog_mutations() from public, anon, authenticated;

create or replace function public.can_read_service_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id
 where i.storage_object_path=p_path and i.visibility_status='visible' and l.kind='service' and l.archived_at is null and b.archived_at is null and (
 vetit_moderation.is_admin() or (auth.uid() is not null and exists(select 1 from public.business_memberships m where m.business_id=b.id and m.profile_id=auth.uid() and m.membership_status='active' and m.member_role in ('owner','admin','catalog_manager'))) or
 (l.moderation_status='published' and b.is_active and b.verification_status='verified' and exists(select 1 from public.listing_markets m join public.markets mk on mk.country_code=m.market_code where m.listing_id=l.id and m.market_code='IN' and m.availability_status='available' and m.compliance_status='approved' and mk.market_status='active'))));$$;
revoke all on function public.can_read_service_image(text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_service_image(text) to anon,authenticated;
do $$begin if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vetit_service_image_select') then
create policy vetit_service_image_select on storage.objects for select to anon,authenticated using(bucket_id='listing-images' and public.can_read_service_image(name));end if;end;$$;

-- Queue access observes current reviewer revocation as well as JWT claims.
-- Supplemental Test candidate step 8. Read-only; no approval path or risk claims.

create or replace function public.admin_listing_queue(
  p_status text default 'submitted', p_kind text default null,
  p_market text default null, p_category uuid default null,
  p_before_created timestamptz default null, p_before_id uuid default null,
  p_limit integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $queue$
declare result jsonb;
begin
  if not vetit_moderation.is_admin() then
    raise exception 'Vetit administrator required.' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('draft','submitted','published','rejected')
     or (p_kind is not null and p_kind not in ('product','service'))
     or (p_market is not null and p_market !~ '^[A-Z]{2}$')
     or p_limit is null or p_limit < 1 or p_limit > 50
     or ((p_before_created is null) <> (p_before_id is null)) then
    raise exception 'Invalid queue filters.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
  from (
    select l.id,l.title,l.business_id,b.display_name as seller_name,
      l.category_id,l.kind,l.moderation_status,l.created_at,l.updated_at,
      b.verification_status as seller_verification,'not_assessed'::text as risk
    from public.listings l join public.businesses b on b.id=l.business_id
    where l.archived_at is null and b.archived_at is null
      and l.moderation_status=p_status
      and (p_kind is null or l.kind=p_kind)
      and (p_category is null or l.category_id=p_category)
      and (p_market is null or exists(select 1 from public.listing_markets m where m.listing_id=l.id and m.market_code=p_market))
      and (p_before_created is null or (l.created_at,l.id)<(p_before_created,p_before_id))
    order by l.created_at desc,l.id desc limit p_limit+1
  ) q;
  return jsonb_build_object('items', result - p_limit, 'hasMore',jsonb_array_length(result)>p_limit);
end;
$queue$;
revoke all on function public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer) to authenticated;


-- Preserve existing review validation; additionally enforce current reviewer grant.
create or replace function public.review_seller_business(p_business_id uuid, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if not vetit_moderation.is_admin() then raise exception 'Current Vetit reviewer access required.' using errcode='42501';end if;
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false) is not true then
    raise exception 'Vetit administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('verified', 'rejected', 'suspended') then
    raise exception 'Choose a supported business review decision.' using errcode = '22023';
  end if;
  perform b.id from public.businesses b where b.id = p_business_id for update;
  if not found then raise exception 'Seller profile not found.' using errcode = 'P0002'; end if;
  perform set_config('vetit.seller_action', 'business_moderation', true);
  update public.businesses b set verification_status = p_decision, is_active = (p_decision <> 'suspended'), updated_at = now()
  where b.id = p_business_id;
  return p_business_id;
end;
$$;
revoke all on function public.review_seller_business(uuid, text) from public, anon, authenticated;
grant execute on function public.review_seller_business(uuid, text) to authenticated;

-- Preserve existing review validation; additionally enforce current reviewer grant.
create or replace function public.review_seller_listing(p_listing_id uuid, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  business_row public.businesses%rowtype;
  listing_business_id uuid;
  active_variants integer;
begin
  if not vetit_moderation.is_admin() then raise exception 'Current Vetit reviewer access required.' using errcode='42501';end if;
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false) is not true then
    raise exception 'Vetit administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('publish', 'reject') then
    raise exception 'Choose publish or reject.' using errcode = '22023';
  end if;
  select l.business_id into listing_business_id from public.listings l where l.id = p_listing_id;
  if not found then raise exception 'Product listing not found.' using errcode = 'P0002'; end if;
  select b.* into business_row from public.businesses b where b.id = listing_business_id for share;
  if not found then raise exception 'Seller profile not found.' using errcode = 'P0002'; end if;
  select l.* into listing_row from public.listings l where l.id = p_listing_id for update;
  if not found or listing_row.kind <> 'product' or listing_row.archived_at is not null or listing_row.moderation_status <> 'submitted' then
    raise exception 'Only an unarchived product submitted for review can be moderated.' using errcode = '22023';
  end if;

  if p_decision = 'publish' then
    if not business_row.is_active or business_row.archived_at is not null or business_row.verification_status <> 'verified' then
      raise exception 'Only an active verified seller can publish products.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.categories c where c.id = listing_row.category_id and c.kind in ('product', 'both') and c.moderation_status = 'active') then
      raise exception 'The product category is no longer active.' using errcode = '22023';
    end if;
    if (select count(*) from public.listing_species s where s.listing_id = p_listing_id) not between 1 and 8
       or not exists (select 1 from public.listing_species s join public.animal_species a on a.id = s.species_id where s.listing_id = p_listing_id and a.is_active)
       or exists (select 1 from public.listing_species s join public.animal_species a on a.id = s.species_id where s.listing_id = p_listing_id and not a.is_active)
       or exists (select 1 from public.category_species cs where cs.category_id = listing_row.category_id)
          and exists (select 1 from public.listing_species s where s.listing_id = p_listing_id and not exists (select 1 from public.category_species cs where cs.category_id = listing_row.category_id and cs.species_id = s.species_id)) then
      raise exception 'The product must have valid active species for its category.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.markets m where m.country_code = 'IN' and m.market_status = 'active' and m.currency_code = 'INR') then
      raise exception 'The India INR market is not active.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.listing_images li where li.listing_id = p_listing_id
        and not exists (select 1 from storage.objects o where o.bucket_id = 'listing-images' and o.name = li.storage_object_path)
    ) then raise exception 'Remove incomplete product photo reservations before publishing.' using errcode = '22023'; end if;
    select count(*) into active_variants from public.product_variants v where v.listing_id = p_listing_id and v.active_status;
    if active_variants = 0 then
      if (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id is null
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1 then
        raise exception 'Exactly one current positive INR price is required to publish.' using errcode = '22023';
      end if;
    elsif exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status and not exists (
        select 1 from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())
      )
    ) then raise exception 'Every active variant must have a current INR price to publish.' using errcode = '22023'; end if;
    if exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status
        and (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1
    ) then raise exception 'Each active variant must have exactly one current INR price.' using errcode = '22023'; end if;
  end if;

  perform set_config('vetit.seller_action', 'moderation', true);
  update public.listing_markets lm set compliance_status = case when p_decision = 'publish' then 'approved' else 'rejected' end
  where lm.listing_id = p_listing_id and lm.market_code = 'IN' and lm.availability_status = 'available';
  if not found then raise exception 'An available India listing market is required.' using errcode = '22023'; end if;
  update public.listings l set moderation_status = case when p_decision = 'publish' then 'published' else 'rejected' end,
    moderated_by = requester_id, moderated_at = now(), updated_at = now()
  where l.id = p_listing_id;
  return p_listing_id;
end;
$$;
revoke all on function public.review_seller_listing(uuid, text) from public, anon, authenticated;
grant execute on function public.review_seller_listing(uuid, text) to authenticated;

create or replace function public.moderation_queue(p_kind text default null,p_state text default null,p_market text default null,p_category uuid default null,p_classification text default null,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not vetit_moderation.is_admin() then raise exception 'Current reviewer required.' using errcode='42501';end if;
 if p_kind is not null and p_kind not in ('seller','product','service') or p_state is not null and p_state not in ('pending','screened','eligible','approved','rejected','corrections','escalated','blocked') or p_market is not null and p_market !~ '^[A-Z]{2}$' or p_classification is not null and p_classification not in ('ordinary','regulated','veterinary','live_animal','prohibited','unconfigured') or (p_before is null)<>(p_id is null) then raise exception 'Invalid queue filters.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into rows from (
 select c.id,c.subject_kind,c.subject_id,c.state,c.version,c.reasons,c.created_at,c.updated_at,b.display_name as seller_name,b.country_code as market,l.category_id,coalesce(l.title,b.display_name) as title,coalesce(p.classification,'unconfigured') as classification
 from vetit_moderation.cases c join public.businesses b on b.id=c.business_id left join public.listings l on l.id=c.subject_id and c.subject_kind<>'seller' left join vetit_moderation.policies p on p.id=c.policy_id
 where c.is_current and b.archived_at is null and (c.subject_kind='seller' or l.archived_at is null) and (p_kind is null or c.subject_kind=p_kind) and (p_state is null or c.state=p_state) and (p_market is null or b.country_code=p_market) and (p_category is null or l.category_id=p_category) and (p_classification is null or coalesce(p.classification,'unconfigured')=p_classification) and (p_before is null or (c.created_at,c.id)<(p_before,p_id))
 order by c.created_at desc,c.id desc limit 26) q;
 return jsonb_build_object('items',rows-25,'hasMore',jsonb_array_length(rows)>25);
end;$$;
revoke all on function public.moderation_queue(text,text,text,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.moderation_queue(text,text,text,uuid,text,timestamptz,uuid) to authenticated;
create or replace function public.moderation_screening_context(p_case uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; p vetit_moderation.policies%rowtype; b public.businesses%rowtype; l public.listings%rowtype;
begin
 select * into c from vetit_moderation.cases where id=p_case;
 if c.id is null then raise exception 'Case unavailable.' using errcode='42501';end if;
 perform vetit_moderation.lock_subject(c.subject_kind,c.subject_id);
 select * into c from vetit_moderation.cases where id=p_case for update;
 if not c.is_current or c.state in ('approved','rejected','corrections') or c.revision<>vetit_moderation.fingerprint(c.subject_kind,c.subject_id) or c.policy_id is distinct from vetit_moderation.policy_for(c.subject_kind,c.subject_id) then raise exception 'Case changed.' using errcode='40001';end if;
 select * into p from vetit_moderation.policies where id=c.policy_id;select * into b from public.businesses where id=c.business_id;
 select * into l from public.listings where id=c.subject_id and c.subject_kind<>'seller';
 return jsonb_build_object('caseId',c.id,'revision',c.revision,'policyId',p.id,'policyVersion',p.version,'kind',c.subject_kind,'subjectId',c.subject_id,'businessId',b.id,'market',b.country_code,'classification',p.classification,'text',coalesce(l.title,b.display_name)||' '||coalesce(l.description,''),
 'requiresCredentials',coalesce(p.classification in ('regulated','veterinary','live_animal'),false) or b.business_type='clinic' or exists(select 1 from public.provider_profiles where business_id=b.id and provider_type in ('veterinary_clinic','veterinarian','livestock_provider')),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.storage_object_path,'storageVersion',encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex')) order by i.id) from public.listing_images i left join storage.objects o on o.bucket_id='listing-images' and o.name=i.storage_object_path where i.listing_id=c.subject_id and c.subject_kind<>'seller'),'[]'::jsonb));
end;$$;
revoke all on function public.moderation_screening_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.moderation_screening_context(uuid) to service_role;
commit;
