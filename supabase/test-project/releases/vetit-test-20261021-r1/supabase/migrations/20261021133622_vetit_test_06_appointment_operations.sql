-- REVIEW PROPOSAL ONLY. Apply after appointment-lifecycle.proposal.sql.
-- No cron, external delivery, hold release, cancellation or automatic refund.
begin;

create table if not exists vetit_appointments.historical_hold_policies (
  policy_version text primary key check (policy_version ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  approved boolean not null default false,
  approved_at timestamptz,
  check (not approved or approved_at is not null)
);
create table if not exists vetit_appointments.historical_hold_reviews (
  slot_id uuid primary key references public.appointment_slots(id),
  business_id uuid not null references public.businesses(id),
  discovered_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','reconciled')),
  booking_id uuid references public.bookings(id),
  customer_profile_id uuid references public.profiles(id),
  actor_profile_id uuid references public.profiles(id),
  policy_version text references vetit_appointments.historical_hold_policies(policy_version),
  evidence_sha256 text check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reconciled_at timestamptz
);
create table if not exists vetit_appointments.worker_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into vetit_appointments.worker_settings(singleton) values(true) on conflict do nothing;
create table if not exists vetit_appointments.worker_runs (
  run_id uuid primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb
);
create table if not exists vetit_appointments.worker_audit (
  run_id uuid references vetit_appointments.worker_runs(run_id),
  business_id uuid references public.businesses(id),
  outcome text not null check (outcome in ('processed','retryable','failed')),
  sqlstate text,
  created_at timestamptz not null default now(),
  primary key(run_id,business_id)
);
alter table vetit_appointments.historical_hold_policies enable row level security;
alter table vetit_appointments.historical_hold_reviews enable row level security;
alter table vetit_appointments.worker_settings enable row level security;
alter table vetit_appointments.worker_runs enable row level security;
alter table vetit_appointments.worker_audit enable row level security;
create index if not exists historical_hold_pending_idx on vetit_appointments.historical_hold_reviews(slot_id) where status='pending';
create index if not exists appointment_operations_held_idx on public.appointment_slots(id,service_listing_id) where status='held';
create index if not exists appointment_operations_offer_slot_idx on vetit_appointments.offers(slot_id);
revoke all on vetit_appointments.historical_hold_policies,vetit_appointments.historical_hold_reviews,
  vetit_appointments.worker_settings,vetit_appointments.worker_runs,vetit_appointments.worker_audit from public,anon,authenticated,service_role;

-- Inventory only. This never changes capacity or claims ownership.
create or replace function public.appointment_inventory_historical_holds()
returns jsonb language plpgsql security definer set search_path='' as $function$
declare added integer;
begin
  insert into vetit_appointments.historical_hold_reviews(slot_id,business_id)
    select s.id,l.business_id from public.appointment_slots s join public.listings l on l.id=s.service_listing_id
    where s.status='held' and not exists(select 1 from vetit_appointments.offers f where f.slot_id=s.id)
      and not exists(select 1 from vetit_appointments.historical_hold_reviews r where r.slot_id=s.id)
    order by s.id limit 500
    on conflict(slot_id) do nothing;
  get diagnostics added=row_count;
  return jsonb_build_object('newReviews',added,'pending',(select count(*) from vetit_appointments.historical_hold_reviews where status='pending'));
end;
$function$;

-- A policy approval is operator-controlled private data, not a caller flag.
-- Evidence digest documents human verification; it is not itself proof of ownership.
create or replace function public.appointment_reconcile_historical_hold(
  p_slot_id uuid,p_booking_id uuid,p_customer_id uuid,p_policy_version text,p_evidence_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare provider uuid; s public.appointment_slots%rowtype; b public.bookings%rowtype;
  review vetit_appointments.historical_hold_reviews%rowtype;
begin
  select l.business_id into provider from public.appointment_slots x join public.listings l on l.id=x.service_listing_id where x.id=p_slot_id;
  if provider is null then raise exception 'Historical slot not found.' using errcode='P0002'; end if;
  perform 1 from public.businesses where id=provider for update;
  perform vetit_appointments.assert_manager(provider);
  if p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Verified evidence digest required.' using errcode='22023'; end if;
  perform 1 from vetit_appointments.historical_hold_policies where policy_version=p_policy_version and approved and approved_at<=now() for share;
  if not found then raise exception 'Historical reconciliation policy is not approved.' using errcode='42501'; end if;
  select * into s from public.appointment_slots where id=p_slot_id for update;
  perform 1 from public.listings where id=s.service_listing_id and business_id=provider for share;
  if not found then raise exception 'Provider identity changed; review again.' using errcode='40001'; end if;
  select * into review from vetit_appointments.historical_hold_reviews where slot_id=p_slot_id and business_id=provider for update;
  if not found then raise exception 'Inventory and review this historical hold first.' using errcode='22023'; end if;
  if review.status='reconciled' then
    if review.booking_id is distinct from p_booking_id or review.customer_profile_id is distinct from p_customer_id
      or review.policy_version is distinct from p_policy_version or review.evidence_sha256 is distinct from p_evidence_sha256 then
      raise exception 'Historical review changed.' using errcode='40001';
    end if;
    return jsonb_build_object('slotId',p_slot_id,'bookingId',review.booking_id,'status','reconciled');
  end if;
  if s.status<>'held' or exists(select 1 from vetit_appointments.offers where slot_id=s.id) then
    raise exception 'Historical slot changed; review again.' using errcode='40001'; end if;
  select * into b from public.bookings where id=p_booking_id and appointment_slot_id=s.id for update;
  if not found or b.customer_profile_id is distinct from p_customer_id or b.provider_business_id is distinct from provider
    or b.service_listing_id is distinct from s.service_listing_id or b.requested_start is distinct from s.starts_at
    or b.requested_end is distinct from s.ends_at or b.status not in ('requested','confirmed') then
    raise exception 'An active, matching owned booking is required; no hold was released.' using errcode='42501'; end if;
  update public.appointment_slots set status='booked',hold_expires_at=null where id=s.id;
  update vetit_appointments.historical_hold_reviews set status='reconciled',booking_id=b.id,customer_profile_id=b.customer_profile_id,
    actor_profile_id=auth.uid(),policy_version=p_policy_version,evidence_sha256=p_evidence_sha256,reconciled_at=now() where slot_id=s.id;
  perform vetit_appointments.record_event(b.id,'historical_hold_preserved',jsonb_build_object('slotId',s.id,'policyVersion',p_policy_version));
  return jsonb_build_object('slotId',s.id,'bookingId',b.id,'status','reconciled');
end;
$function$;

-- Stable receipts make uncertain-network retries safe. Partial retryable failures
-- use a NEW run ID; each provider's expiry transaction rolls back independently.
create or replace function public.appointment_expiry_worker_run(p_run_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare receipt jsonb; provider record; processed integer:=0; retryable integer:=0; failures integer:=0; code text;
begin
  if p_run_id is null or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid worker batch.' using errcode='22023'; end if;
  insert into vetit_appointments.worker_runs(run_id) values(p_run_id) on conflict(run_id) do nothing;
  select result into receipt from vetit_appointments.worker_runs where run_id=p_run_id for update;
  if receipt is not null then return receipt; end if;
  perform 1 from vetit_appointments.worker_settings where singleton and enabled for share;
  if not found then
    receipt:=jsonb_build_object('state','disabled','processed',0,'retryable',0,'failed',0,'hasMore',false);
  else
    for provider in select b.id from public.businesses b where
      exists(select 1 from vetit_appointments.offers f where f.business_id=b.id and f.status='offered' and f.expires_at<=now())
      or exists(select 1 from vetit_appointments.waitlist w where w.business_id=b.id and w.status='waiting' and w.ends_at<=now())
      order by b.id limit p_limit for update of b skip locked loop
      begin
        perform vetit_appointments.expire_offers(provider.id);
        insert into vetit_appointments.worker_audit(run_id,business_id,outcome) values(p_run_id,provider.id,'processed');
        processed:=processed+1;
      exception when others then
        get stacked diagnostics code=returned_sqlstate;
        if code in ('40001','40P01','55P03','57014') then
          retryable:=retryable+1;
          insert into vetit_appointments.worker_audit(run_id,business_id,outcome,sqlstate) values(p_run_id,provider.id,'retryable',code);
        else
          failures:=failures+1;
          insert into vetit_appointments.worker_audit(run_id,business_id,outcome,sqlstate) values(p_run_id,provider.id,'failed',code);
        end if;
      end;
    end loop;
    receipt:=jsonb_build_object('state','completed','processed',processed,'retryable',retryable,'failed',failures,'hasMore',exists(
      select 1 from vetit_appointments.offers where status='offered' and expires_at<=now()
      union all select 1 from vetit_appointments.waitlist where status='waiting' and ends_at<=now()));
  end if;
  update vetit_appointments.worker_runs set result=receipt,completed_at=now() where run_id=p_run_id;
  return receipt;
end;
$function$;

revoke all on function public.appointment_inventory_historical_holds() from public,anon,authenticated;
revoke all on function public.appointment_reconcile_historical_hold(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.appointment_expiry_worker_run(uuid,integer) from public,anon,authenticated;
grant execute on function public.appointment_inventory_historical_holds() to service_role;
grant execute on function public.appointment_reconcile_historical_hold(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.appointment_expiry_worker_run(uuid,integer) to service_role;
commit;
