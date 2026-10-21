-- Supplemental proposal AFTER all eleven frozen candidate steps. Not authorized for hosted use.
begin;
create table if not exists vetit_moderation.reviewer_scopes (
 profile_id uuid not null references vetit_moderation.reviewers(profile_id),
 business_id uuid not null references public.businesses(id),
 can_read boolean not null default true, can_review boolean not null default false,
 can_publish boolean not null default false, enabled boolean not null default false,
 expires_at timestamptz not null, primary key(profile_id,business_id),
 check(not can_review or can_read),check(not can_publish or can_review),check(isfinite(expires_at))
);
alter table vetit_moderation.reviewer_scopes enable row level security;
revoke all on vetit_moderation.reviewer_scopes from public,anon,authenticated,service_role;
create table if not exists vetit_moderation.scope_events (
 id bigint generated always as identity primary key, actor name not null default session_user,
 created_at timestamptz not null default clock_timestamp(),operation text not null,
 previous_grant jsonb,next_grant jsonb
);
alter table vetit_moderation.scope_events enable row level security;
revoke all on vetit_moderation.scope_events from public,anon,authenticated,service_role;
revoke all on sequence vetit_moderation.scope_events_id_seq from public,anon,authenticated,service_role;
create or replace function vetit_moderation.log_scope() returns trigger language plpgsql set search_path='' as $$
begin insert into vetit_moderation.scope_events(operation,previous_grant,next_grant) values(tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);return null;end;$$;
create or replace trigger reviewer_scope_audit after insert or update or delete on vetit_moderation.reviewer_scopes for each row execute function vetit_moderation.log_scope();
create or replace trigger scope_events_immutable before update or delete on vetit_moderation.scope_events for each row execute function vetit_moderation.immutable_record();
create or replace function vetit_moderation.reviewer_eligible() returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'vetit_reviewer','false')='true'
 and exists(select 1 from auth.users u join vetit_moderation.reviewers r on r.profile_id=u.id where u.id=auth.uid() and r.enabled and coalesce(u.raw_app_meta_data->>'vetit_reviewer','false')='true');$$;
create or replace function vetit_moderation.has_scope(b uuid,operation text) returns boolean language sql stable set search_path='' as $$
 select vetit_moderation.reviewer_eligible() and exists(select 1 from vetit_moderation.reviewer_scopes g where g.profile_id=auth.uid() and g.business_id=b and g.enabled and g.expires_at>statement_timestamp() and g.can_read and case operation when 'read' then true when 'review' then g.can_review when 'publish' then g.can_review and g.can_publish else false end);$$;
create or replace function vetit_moderation.has_any_scope() returns boolean language sql stable set search_path='' as $$
 select vetit_moderation.reviewer_eligible() and exists(select 1 from vetit_moderation.reviewer_scopes g where g.profile_id=auth.uid() and g.enabled and g.can_read and g.expires_at>statement_timestamp());$$;
create or replace function vetit_moderation.require_scope(b uuid,operation text) returns void language plpgsql set search_path='' as $$
begin
 perform profile_id from vetit_moderation.reviewers where profile_id=auth.uid() and enabled for share;
 perform id from auth.users where id=auth.uid() for share;
 perform profile_id from vetit_moderation.reviewer_scopes where profile_id=auth.uid() and business_id=b for share;
 if not vetit_moderation.has_scope(b,operation) then raise exception 'Business reviewer permission required.' using errcode='42501';end if;
end;$$;
revoke all on function vetit_moderation.log_scope(),vetit_moderation.reviewer_eligible(),vetit_moderation.has_scope(uuid,text),vetit_moderation.has_any_scope(),vetit_moderation.require_scope(uuid,text) from public,anon,authenticated,service_role;

create or replace function vetit_moderation.authorize(b uuid,admin_only boolean default false) returns void language plpgsql set search_path='' as $$
begin
 if vetit_moderation.has_scope(b,'review') then
   perform profile_id from vetit_moderation.reviewers where profile_id=auth.uid() and enabled for share;
   if found then perform vetit_moderation.require_scope(b,'review');return;end if;
 end if;
 if auth.uid() is null or admin_only then raise exception 'Moderator access required.' using errcode='42501';end if;
 perform profile_id from public.business_memberships where business_id=b and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager') for share;
 if not found then raise exception 'Subject access denied.' using errcode='42501';end if;
end;$$;
create or replace function public.moderation_decide(p_case uuid,p_version bigint,p_action text,p_request uuid,p_reasons text[] default '{}',p_note text default '',p_correction text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; previous vetit_moderation.events%rowtype; h text; checks text[]; result jsonb; old_state text; next_state text; automatic boolean;
begin
 select * into c from vetit_moderation.cases where id=p_case;
 if c.id is null then raise exception 'Case unavailable.' using errcode='42501';end if;
 perform vetit_moderation.lock_subject(c.subject_kind,c.subject_id);
 perform vetit_moderation.authorize(c.business_id,p_action<>'screen');
 if p_action<>'screen' then perform vetit_moderation.require_scope(c.business_id,case when p_action='approve' then 'publish' else 'review' end);end if;
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
 if not vetit_moderation.has_scope(c.business_id,case when approving then 'publish' else 'review' end) or c.id is null or c.revision<>vetit_moderation.fingerprint(k,s) then raise exception 'Current audited moderation required.' using errcode='42501';end if;
 if approving then
 if c.state<>'approved' or c.approved_by is distinct from auth.uid() or cardinality(array_remove(vetit_moderation.reasons_for(c),'HUMAN_REVIEW_REQUIRED'))>0 or not exists(select 1 from vetit_moderation.events where case_id=c.id and request_id=c.approval_request and operation='approve') then
   raise exception 'A current audited moderation approval is required.' using errcode='42501';
 end if;
 elsif c.state not in ('rejected','corrections') or not exists(select 1 from vetit_moderation.events where case_id=c.id and actor_id=auth.uid() and operation in ('reject','corrections') and to_state=c.state) then raise exception 'Audited rejection required.' using errcode='42501';end if;
 return new;
end;$$;
create or replace function public.moderation_status(p_kind text,p_subject uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; b uuid; result jsonb;
begin
 select * into c from vetit_moderation.cases where subject_kind=p_kind and subject_id=p_subject and is_current;
 if c.id is null then
   select case when p_kind='seller' then p_subject else (select business_id from public.listings where id=p_subject and kind=p_kind) end into b;
 else b:=c.business_id;end if;
 -- Read-only authorization; no FOR SHARE is used in this stable reader.
 if auth.uid() is null or not vetit_moderation.has_scope(b,'read') and not exists(select 1 from public.business_memberships where business_id=b and profile_id=auth.uid() and membership_status='active' and member_role in ('owner','admin','catalog_manager')) then raise exception 'Subject access denied.' using errcode='42501';end if;
 if c.id is null then return jsonb_build_object('case',null,'events','[]'::jsonb);end if;
 select jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',c.reasons,'correction',c.correction,'revision',c.revision,'policyId',c.policy_id,'policyVersion',p.version,'updatedAt',c.updated_at,'automaticApproval',vetit_moderation.automatic_status(c.id)),
 'events',coalesce((select jsonb_agg(x.event order by x.id desc) from (select e.id,jsonb_build_object('id',e.id,'operation',e.operation,'state',e.to_state,'reasons',e.reasons,'at',e.created_at,'reviewer',case when vetit_moderation.has_scope(b,'read') then e.actor_id end,'note',case when vetit_moderation.has_scope(b,'read') then e.note end) event from vetit_moderation.events e where e.case_id in(select history.id from vetit_moderation.cases history where history.subject_kind=c.subject_kind and history.subject_id=c.subject_id) order by e.id desc limit 50) x),'[]'::jsonb)) into result from (select c.policy_id id) source left join vetit_moderation.policies p on p.id=source.id;
 if result is null then return jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',array['POLICY_UNAVAILABLE'],'correction',c.correction),'events','[]'::jsonb);end if;
 return result;
end;$$;
create or replace function public.moderation_queue(p_kind text default null,p_state text default null,p_market text default null,p_category uuid default null,p_classification text default null,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not vetit_moderation.has_any_scope() then raise exception 'Current reviewer required.' using errcode='42501';end if;
 if p_kind is not null and p_kind not in ('seller','product','service') or p_state is not null and p_state not in ('pending','screened','eligible','approved','rejected','corrections','escalated','blocked') or p_market is not null and p_market !~ '^[A-Z]{2}$' or p_classification is not null and p_classification not in ('ordinary','regulated','veterinary','live_animal','prohibited','unconfigured') or (p_before is null)<>(p_id is null) then raise exception 'Invalid queue filters.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into rows from (
 select c.id,c.subject_kind,c.subject_id,c.state,c.version,c.reasons,c.created_at,c.updated_at,b.display_name as seller_name,b.country_code as market,l.category_id,coalesce(l.title,b.display_name) as title,coalesce(p.classification,'unconfigured') as classification,vetit_moderation.automatic_status(c.id) as automatic_approval
 from vetit_moderation.cases c join public.businesses b on b.id=c.business_id left join public.listings l on l.id=c.subject_id and c.subject_kind<>'seller' left join vetit_moderation.policies p on p.id=c.policy_id
 where vetit_moderation.has_scope(c.business_id,'read') and c.is_current and b.archived_at is null and (c.subject_kind='seller' or l.archived_at is null) and (p_kind is null or c.subject_kind=p_kind) and (p_state is null or c.state=p_state) and (p_market is null or b.country_code=p_market) and (p_category is null or l.category_id=p_category) and (p_classification is null or coalesce(p.classification,'unconfigured')=p_classification) and (p_before is null or (c.created_at,c.id)<(p_before,p_id))
 order by c.created_at desc,c.id desc limit 26) q;
 return jsonb_build_object('items',rows-25,'hasMore',jsonb_array_length(rows)>25);
end;$$;
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
  if not vetit_moderation.has_any_scope() then
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
    where vetit_moderation.has_scope(l.business_id,'read') and l.archived_at is null and b.archived_at is null
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
create or replace function public.review_seller_business(p_business_id uuid, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  perform vetit_moderation.require_scope(p_business_id,case when p_decision='verified' then 'publish' else 'review' end);
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_reviewer') = 'true', false) is not true then
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
  
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_reviewer') = 'true', false) is not true then
    raise exception 'Vetit administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('publish', 'reject') then
    raise exception 'Choose publish or reject.' using errcode = '22023';
  end if;
  select l.business_id into listing_business_id from public.listings l where l.id = p_listing_id;
  if not found then raise exception 'Product listing not found.' using errcode = 'P0002'; end if;
  perform vetit_moderation.require_scope(listing_business_id,case when p_decision='publish' then 'publish' else 'review' end);
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
create or replace function public.can_read_service_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id
 where i.storage_object_path=p_path and i.visibility_status='visible' and l.kind='service' and l.archived_at is null and b.archived_at is null and (
 vetit_moderation.has_scope(b.id,'read') or (auth.uid() is not null and exists(select 1 from public.business_memberships m where m.business_id=b.id and m.profile_id=auth.uid() and m.membership_status='active' and m.member_role in ('owner','admin','catalog_manager'))) or
 (l.moderation_status='published' and b.is_active and b.verification_status='verified' and exists(select 1 from public.listing_markets m join public.markets mk on mk.country_code=m.market_code where m.listing_id=l.id and m.market_code='IN' and m.availability_status='available' and m.compliance_status='approved' and mk.market_status='active'))));$$;
create or replace function public.can_read_moderated_listing_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id
 where i.storage_object_path=p_path and i.visibility_status='visible' and public.seller_image_path_is_canonical(p_path,b.id,l.id) and (
 (auth.uid() is not null and exists(select 1 from public.business_memberships m where m.business_id=b.id and m.profile_id=auth.uid() and m.membership_status='active'))
 or (l.kind='service' and l.archived_at is null and b.archived_at is null and vetit_moderation.has_scope(b.id,'read'))
 or (l.moderation_status='published' and l.archived_at is null and b.is_active and b.archived_at is null and b.verification_status='verified' and exists(select 1 from public.listing_markets lm join public.markets mk on mk.country_code=lm.market_code where lm.listing_id=l.id and lm.availability_status='available' and lm.compliance_status='approved' and mk.market_status='active' and (l.kind='product' or lm.market_code='IN')))
 ));$$;
create or replace function public.guard_seller_catalog_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  is_vetit_admin boolean := false;
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
    is_vetit_admin := vetit_moderation.has_scope(new.id,'review');
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
    is_vetit_admin := vetit_moderation.has_scope(new.business_id,'review');
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
  is_vetit_admin := vetit_moderation.has_scope(parent_business_id,'review');
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
create or replace function vetit_moderation.is_admin() returns boolean language sql stable set search_path='' as $$select false;$$;
commit;
