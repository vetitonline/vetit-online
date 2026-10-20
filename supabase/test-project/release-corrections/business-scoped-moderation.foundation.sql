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
