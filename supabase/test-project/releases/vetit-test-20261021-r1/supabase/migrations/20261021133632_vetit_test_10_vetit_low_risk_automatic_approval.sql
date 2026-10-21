-- Supplemental step 10. Automatic approval is not publication. No live activation.
begin;
create table if not exists vetit_moderation.automation_controls (
 singleton boolean primary key default true check(singleton),
 approval_enabled boolean not null default false,
 publication_enabled boolean not null default false check(not publication_enabled)
);
create table if not exists vetit_moderation.automation_control_events (
 id bigint generated always as identity primary key,
 approval_enabled boolean not null,changed_by name not null default current_user,
 created_at timestamptz not null default clock_timestamp()
);
create table if not exists vetit_moderation.automatic_approvals (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references vetit_moderation.cases(id),
 revision text not null check(revision ~ '^[0-9a-f]{64}$'),policy_id uuid not null references vetit_moderation.policies(id),
 request_id uuid not null unique,valid_until timestamptz not null,created_at timestamptz not null default clock_timestamp()
);
create index if not exists automatic_approvals_current on vetit_moderation.automatic_approvals(case_id,created_at desc,id desc);
alter table vetit_moderation.automation_controls enable row level security;
alter table vetit_moderation.automation_control_events enable row level security;
alter table vetit_moderation.automatic_approvals enable row level security;
revoke all on vetit_moderation.automation_controls,vetit_moderation.automation_control_events,vetit_moderation.automatic_approvals from public,anon,authenticated,service_role;
revoke all on sequence vetit_moderation.automation_control_events_id_seq from public,anon,authenticated,service_role;
create or replace function vetit_moderation.log_automation_control() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' or new.approval_enabled is distinct from old.approval_enabled then
 insert into vetit_moderation.automation_control_events(approval_enabled) values(new.approval_enabled);end if;
 return new;
end;$$;
revoke all on function vetit_moderation.log_automation_control() from public,anon,authenticated,service_role;
create or replace trigger moderation_automation_control_log after insert or update on vetit_moderation.automation_controls for each row execute function vetit_moderation.log_automation_control();
create or replace trigger moderation_auto_approvals_immutable before update or delete on vetit_moderation.automatic_approvals for each row execute function vetit_moderation.immutable_record();
create or replace trigger moderation_automation_control_history_immutable before update or delete on vetit_moderation.automation_control_events for each row execute function vetit_moderation.immutable_record();
insert into vetit_moderation.automation_controls(singleton) values(true) on conflict(singleton) do nothing;

create or replace function public.moderation_auto_approve(p_case uuid,p_version bigint,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c vetit_moderation.cases%rowtype; p vetit_moderation.policies%rowtype; prior vetit_moderation.events%rowtype;
 enabled boolean; checks text[]; h text; expires timestamptz; result jsonb; old_state text;
begin
 if p_request is null or p_version is null or p_version<1 then raise exception 'Version and idempotency key required.' using errcode='22023';end if;
 select * into c from vetit_moderation.cases where id=p_case;
 if c.id is null then raise exception 'Case unavailable.' using errcode='42501';end if;
 perform vetit_moderation.lock_subject(c.subject_kind,c.subject_id);
 select approval_enabled into enabled from vetit_moderation.automation_controls where singleton for share;
 select * into c from vetit_moderation.cases where id=p_case for update;
 h:=encode(sha256(convert_to(jsonb_build_array(p_case,p_version,'auto_approve')::text,'UTF8')),'hex');
 select * into prior from vetit_moderation.events where request_id=p_request;
 if found then
   if prior.operation<>'auto_approve' or prior.actor_id is not null or prior.payload_hash<>h then raise exception 'Idempotency key conflict.' using errcode='22023';end if;
   return prior.result;
 end if;
 if not c.is_current or c.version<>p_version or c.revision<>vetit_moderation.fingerprint(c.subject_kind,c.subject_id) then raise exception 'Case changed.' using errcode='40001';end if;
 if not coalesce(enabled,false) then return jsonb_build_object('caseId',c.id,'version',c.version,'outcome','disabled','published',false,'reasons',array['AUTOMATIC_APPROVAL_DISABLED']);end if;
 select * into p from vetit_moderation.policies where id=c.policy_id;
 checks:=vetit_moderation.reasons_for(c);
 if c.subject_kind not in ('product','service') or c.state not in ('pending','screened','eligible') or p.id is null or p.classification<>'ordinary' or not p.automatic_eligible or cardinality(checks)>0 then
 return jsonb_build_object('caseId',c.id,'version',c.version,'outcome','review_required','published',false,'reasons',case when cardinality(checks)>0 then checks else array['AUTOMATIC_POLICY_OR_STATE_NOT_ELIGIBLE'] end);
 end if;
 -- These checks are mandatory for ordinary product/service listings. Latest
 -- evidence only: an older pass cannot override a newer failure/uncertainty.
 select min(x.expires_at) into expires from (
 select distinct on(e.check_code) e.expires_at from vetit_moderation.evidence e
 where e.case_id=c.id and e.policy_id=p.id and e.revision=c.revision and e.check_code in ('content','images','legal')
 order by e.check_code,e.created_at desc,e.id desc) x;
 if expires is null or expires<=clock_timestamp() then raise exception 'Evidence expired.' using errcode='40001';end if;
 if exists(select 1 from vetit_moderation.automatic_approvals a where a.case_id=c.id and a.revision=c.revision and a.policy_id=p.id and a.valid_until>clock_timestamp()) then return jsonb_build_object('caseId',c.id,'version',c.version,'outcome','already_approved','published',false);end if;
 old_state:=c.state;
 update vetit_moderation.cases set state='eligible',reasons='{}',version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 result:=jsonb_build_object('caseId',c.id,'version',c.version,'outcome','approved','published',false,'validUntil',expires);
 insert into vetit_moderation.automatic_approvals(case_id,revision,policy_id,request_id,valid_until) values(c.id,c.revision,p.id,p_request,expires);
 insert into vetit_moderation.events(case_id,request_id,operation,payload_hash,from_state,to_state,result) values(c.id,p_request,'auto_approve',h,old_state,'eligible',result);
 -- No listing/business UPDATE and no call to a publication RPC is permitted.
 return result;
end;$$;
revoke all on function public.moderation_auto_approve(uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.moderation_auto_approve(uuid,bigint,uuid) to service_role;

create or replace function vetit_moderation.automatic_status(p_case uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare c vetit_moderation.cases%rowtype; a vetit_moderation.automatic_approvals%rowtype; valid boolean;
begin
 select * into c from vetit_moderation.cases where id=p_case;
 select * into a from vetit_moderation.automatic_approvals where case_id=p_case order by created_at desc,id desc limit 1;
 if a.id is null then return jsonb_build_object('status','not_approved','publicationEnabled',false);end if;
 valid:=c.is_current and c.state in ('eligible','approved') and c.revision=a.revision and c.policy_id=a.policy_id and a.valid_until>clock_timestamp() and cardinality(vetit_moderation.reasons_for(c))=0 and coalesce((select approval_enabled from vetit_moderation.automation_controls where singleton),false);
 return jsonb_build_object('status',case when valid then 'approved' else 'review_required' end,'publicationEnabled',false,'approvedAt',a.created_at,'validUntil',a.valid_until);
end;$$;
revoke all on function vetit_moderation.automatic_status(uuid) from public,anon,authenticated,service_role;

-- Preserve existing reader authorization; add automatic decision metadata.
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
 select jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',c.reasons,'correction',c.correction,'revision',c.revision,'policyId',c.policy_id,'policyVersion',p.version,'updatedAt',c.updated_at,'automaticApproval',vetit_moderation.automatic_status(c.id)),
 'events',coalesce((select jsonb_agg(x.event order by x.id desc) from (select e.id,jsonb_build_object('id',e.id,'operation',e.operation,'state',e.to_state,'reasons',e.reasons,'at',e.created_at,'reviewer',case when vetit_moderation.is_admin() then e.actor_id end,'note',case when vetit_moderation.is_admin() then e.note end) event from vetit_moderation.events e where e.case_id in(select history.id from vetit_moderation.cases history where history.subject_kind=c.subject_kind and history.subject_id=c.subject_id) order by e.id desc limit 50) x),'[]'::jsonb)) into result from (select c.policy_id id) source left join vetit_moderation.policies p on p.id=source.id;
 if result is null then return jsonb_build_object('case',jsonb_build_object('caseId',c.id,'version',c.version,'state',c.state,'reasons',array['POLICY_UNAVAILABLE'],'correction',c.correction),'events','[]'::jsonb);end if;
 return result;
end;$$;

-- Preserve existing reader authorization; add automatic decision metadata.
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
 return jsonb_build_object('caseId',c.id,'version',c.version,'revision',c.revision,'policyId',p.id,'policyVersion',p.version,'kind',c.subject_kind,'subjectId',c.subject_id,'businessId',b.id,'market',b.country_code,'classification',p.classification,'text',coalesce(l.title,b.display_name)||' '||coalesce(l.description,''),
 'requiresCredentials',coalesce(p.classification in ('regulated','veterinary','live_animal'),false) or b.business_type='clinic' or exists(select 1 from public.provider_profiles where business_id=b.id and provider_type in ('veterinary_clinic','veterinarian','livestock_provider')),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.storage_object_path,'storageVersion',encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex')) order by i.id) from public.listing_images i left join storage.objects o on o.bucket_id='listing-images' and o.name=i.storage_object_path where i.listing_id=c.subject_id and c.subject_kind<>'seller'),'[]'::jsonb));
end;$$;

-- Preserve existing reader authorization; add automatic decision metadata.
create or replace function public.moderation_queue(p_kind text default null,p_state text default null,p_market text default null,p_category uuid default null,p_classification text default null,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not vetit_moderation.is_admin() then raise exception 'Current reviewer required.' using errcode='42501';end if;
 if p_kind is not null and p_kind not in ('seller','product','service') or p_state is not null and p_state not in ('pending','screened','eligible','approved','rejected','corrections','escalated','blocked') or p_market is not null and p_market !~ '^[A-Z]{2}$' or p_classification is not null and p_classification not in ('ordinary','regulated','veterinary','live_animal','prohibited','unconfigured') or (p_before is null)<>(p_id is null) then raise exception 'Invalid queue filters.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into rows from (
 select c.id,c.subject_kind,c.subject_id,c.state,c.version,c.reasons,c.created_at,c.updated_at,b.display_name as seller_name,b.country_code as market,l.category_id,coalesce(l.title,b.display_name) as title,coalesce(p.classification,'unconfigured') as classification,vetit_moderation.automatic_status(c.id) as automatic_approval
 from vetit_moderation.cases c join public.businesses b on b.id=c.business_id left join public.listings l on l.id=c.subject_id and c.subject_kind<>'seller' left join vetit_moderation.policies p on p.id=c.policy_id
 where c.is_current and b.archived_at is null and (c.subject_kind='seller' or l.archived_at is null) and (p_kind is null or c.subject_kind=p_kind) and (p_state is null or c.state=p_state) and (p_market is null or b.country_code=p_market) and (p_category is null or l.category_id=p_category) and (p_classification is null or coalesce(p.classification,'unconfigured')=p_classification) and (p_before is null or (c.created_at,c.id)<(p_before,p_id))
 order by c.created_at desc,c.id desc limit 26) q;
 return jsonb_build_object('items',rows-25,'hasMore',jsonb_array_length(rows)>25);
end;$$;

commit;
