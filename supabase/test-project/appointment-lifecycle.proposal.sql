-- REVIEW PROPOSAL ONLY. Never part of the default migrations directory.
-- Requires the canonical baseline, seller hardening, commerce and booking proposals.
-- Run only in disposable PostgreSQL first; do not apply to Test/production here.
-- One resource = one simultaneous appointment. Capacity uses separate resource keys.
begin;

do $preflight$
begin
  if to_regprocedure('public.book_my_appointment(uuid,text)') is null then
    raise exception 'Apply and verify the prior booking proposal in disposable PostgreSQL first.';
  end if;
end;
$preflight$;

create schema vetit_appointments;
revoke all on schema vetit_appointments from public, anon, authenticated;
alter table public.appointment_slots add column lifecycle_resource_key text not null default 'default'
  check (lifecycle_resource_key ~ '^[a-zA-Z0-9_-]{1,80}$');
alter table public.bookings add column lifecycle_policy_snapshot jsonb;
alter table public.bookings add column lifecycle_revision integer not null default 1 check (lifecycle_revision >= 1);
-- Permit separate daycare places/clinicians for the same service at the same
-- start, while retaining uniqueness within each resource. Resolve the canonical
-- constraint by its columns, never by an assumed deployment-specific name.
do $resource_capacity$
declare previous_constraint text;
begin
  select c.conname into previous_constraint from pg_catalog.pg_constraint c
  where c.conrelid = 'public.appointment_slots'::regclass and c.contype = 'u'
    and c.conkey = array[
      (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = c.conrelid and a.attname = 'service_listing_id' and not a.attisdropped),
      (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = c.conrelid and a.attname = 'starts_at' and not a.attisdropped)
    ]::smallint[];
  if previous_constraint is null then raise exception 'Canonical slot uniqueness is missing; review migration history before changing capacity.'; end if;
  execute pg_catalog.format('alter table public.appointment_slots drop constraint %I',previous_constraint);
end;
$resource_capacity$;
alter table public.appointment_slots add constraint appointment_slots_service_resource_start_uq unique(service_listing_id,lifecycle_resource_key,starts_at);
-- Catalogue/fulfilment roles do not need appointment customer details.
alter policy bookings_read_participant on public.bookings using (
  customer_profile_id = (select auth.uid()) or exists (
    select 1 from public.business_memberships m where m.business_id = provider_business_id
      and m.profile_id = (select auth.uid()) and m.member_role in ('owner','admin') and m.membership_status = 'active'
  )
);

-- Legacy overlapping slots require an explicit resource reconciliation, not silent allocation.
do $preflight$
begin
  if exists (
    select 1 from public.appointment_slots a
    join public.listings la on la.id = a.service_listing_id
    join public.listings lb on lb.business_id = la.business_id
    join public.appointment_slots b on b.service_listing_id = lb.id and b.id > a.id
    where a.status <> 'cancelled' and b.status <> 'cancelled' and a.ends_at > now() and b.ends_at > now()
      and a.lifecycle_resource_key = b.lifecycle_resource_key
      and a.starts_at < b.ends_at and b.starts_at < a.ends_at
  ) then raise exception 'Reconcile legacy overlapping provider resources before applying lifecycle proposal.'; end if;
end;
$preflight$;
create index appointment_slots_lifecycle_resource_time on public.appointment_slots(service_listing_id,lifecycle_resource_key,starts_at) where status <> 'cancelled';

create table vetit_appointments.policies (
  service_listing_id uuid primary key references public.service_offerings(listing_id),
  business_id uuid not null references public.businesses(id),
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  updated_at timestamptz not null default now()
);
create table vetit_appointments.waitlist (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.profiles(id),
  service_listing_id uuid not null references public.service_offerings(listing_id),
  business_id uuid not null references public.businesses(id),
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  market_code char(2) not null references public.markets(country_code),
  status text not null default 'waiting' check (status in ('waiting','offered','accepted','left','expired')),
  created_at timestamptz not null default now()
);
create index appointment_policies_business on vetit_appointments.policies(business_id,service_listing_id);
create index waitlist_customer_history on vetit_appointments.waitlist(customer_profile_id,created_at desc,id);
create unique index waitlist_one_active_per_service on vetit_appointments.waitlist(customer_profile_id, service_listing_id)
  where status in ('waiting','offered');
create index waitlist_fifo on vetit_appointments.waitlist(service_listing_id, created_at, id) where status = 'waiting';
create table vetit_appointments.offers (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references vetit_appointments.waitlist(id),
  slot_id uuid not null references public.appointment_slots(id),
  business_id uuid not null references public.businesses(id),
  customer_profile_id uuid not null references public.profiles(id),
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired')),
  policy_snapshot jsonb not null,
  price_minor bigint not null check (price_minor >= 0), currency_code char(3) not null,
  expires_at timestamptz not null,
  booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now()
);
create unique index offers_one_live_per_slot on vetit_appointments.offers(slot_id) where status = 'offered';
create index offers_customer_history on vetit_appointments.offers(customer_profile_id,created_at desc,id);
create unique index offers_one_live_per_entry on vetit_appointments.offers(entry_id) where status = 'offered';
create index offers_expiry on vetit_appointments.offers(business_id, expires_at) where status = 'offered';
create index offers_worker_expiry on vetit_appointments.offers(expires_at,business_id) where status = 'offered';
create index waitlist_worker_expiry on vetit_appointments.waitlist(ends_at,business_id) where status = 'waiting';
create table vetit_appointments.events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  business_id uuid not null references public.businesses(id),
  customer_profile_id uuid not null references public.profiles(id),
  actor_profile_id uuid references public.profiles(id),
  event_type text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index appointment_events_booking_time on vetit_appointments.events(booking_id, created_at, id);
create table vetit_appointments.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id),
  deduplication_key text not null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(), read_at timestamptz,
  unique (recipient_profile_id, deduplication_key)
);
create index appointment_notifications_recipient_time on vetit_appointments.notifications(recipient_profile_id, created_at desc);
create table vetit_appointments.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references vetit_appointments.notifications(id),
  channel text not null check (channel in ('email','push')),
  status text not null default 'disabled' check (status in ('disabled','pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index appointment_outbox_pending on vetit_appointments.notification_outbox(available_at,id) where status in ('pending','failed');
create table vetit_appointments.refund_requests (
  booking_id uuid primary key references public.bookings(id),
  customer_profile_id uuid not null references public.profiles(id),
  business_id uuid not null references public.businesses(id),
  refund_minor bigint not null check (refund_minor >= 0),
  proposed_retained_minor bigint not null check (proposed_retained_minor >= 0),
  charge_status text not null default 'not_collected' check (charge_status in ('not_collected','review_required')),
  currency_code char(3) not null,
  action text not null check (action in ('none','refund','void','review')),
  status text not null check (status in ('not_required','review_required','processing','completed','failed')),
  created_at timestamptz not null default now()
);

-- Internal ledger writes are possible only through these guarded functions.
alter table vetit_appointments.policies enable row level security;
alter table vetit_appointments.waitlist enable row level security;
alter table vetit_appointments.offers enable row level security;
alter table vetit_appointments.events enable row level security;
alter table vetit_appointments.notifications enable row level security;
alter table vetit_appointments.notification_outbox enable row level security;
alter table vetit_appointments.refund_requests enable row level security;
revoke all on all tables in schema vetit_appointments from public, anon, authenticated;
revoke all on all sequences in schema vetit_appointments from public, anon, authenticated;
alter default privileges in schema vetit_appointments revoke execute on functions from public;

-- Reuse existing server-price and eligibility resolution. Hide the original entry
-- point so it cannot bypass offers or policy capture through direct PostgREST calls.
alter function public.book_my_appointment(uuid,text) set schema vetit_appointments;
revoke all on function vetit_appointments.book_my_appointment(uuid,text) from public, anon, authenticated;

create function vetit_appointments.assert_manager(p_business_id uuid)
returns void language plpgsql set search_path = '' as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform 1 from public.business_memberships m where m.business_id = p_business_id
    and m.profile_id = auth.uid() and m.member_role in ('owner','admin') and m.membership_status = 'active' for share;
  if not found then raise exception 'Provider management is not permitted.' using errcode = '42501'; end if;
end;
$function$;

create function vetit_appointments.assert_policy(p_policy jsonb)
returns void language plpgsql set search_path = '' as $function$
begin
  if p_policy is null or jsonb_typeof(p_policy) <> 'object'
    or jsonb_typeof(p_policy->'allowCustomerCancellation') is distinct from 'boolean'
    or jsonb_typeof(p_policy->'allowReschedule') is distinct from 'boolean'
    or jsonb_typeof(p_policy->'allowLateCancellation') is distinct from 'boolean'
    or jsonb_typeof(p_policy->'noticeMinutes') is distinct from 'number'
    or jsonb_typeof(p_policy->'refundBasisPoints') is distinct from 'number'
    or jsonb_typeof(p_policy->'lateRefundBasisPoints') is distinct from 'number'
    or jsonb_typeof(p_policy->'offerExpiryMinutes') is distinct from 'number'
    or coalesce(p_policy->>'noticeMinutes','') !~ '^[0-9]+$'
    or coalesce(p_policy->>'refundBasisPoints','') !~ '^[0-9]+$'
    or coalesce(p_policy->>'lateRefundBasisPoints','') !~ '^[0-9]+$'
    or coalesce(p_policy->>'offerExpiryMinutes','') !~ '^[0-9]+$' then
    raise exception 'Explicit appointment policy is required.' using errcode = '22023';
  end if;
  if (p_policy->>'noticeMinutes')::numeric not between 0 and 43200
    or (p_policy->>'refundBasisPoints')::numeric not between 0 and 10000
    or (p_policy->>'lateRefundBasisPoints')::numeric not between 0 and 10000
    or (p_policy->>'offerExpiryMinutes')::numeric not between 1 and 1440 then
    raise exception 'Policy is outside allowed bounds.' using errcode = '22023';
  end if;
  if (p_policy->>'allowLateCancellation')::boolean and (p_policy->>'lateRefundBasisPoints')::integer < 10000
    and (coalesce(p_policy->>'lateCancellationChargePermitted','false') <> 'true'
      or jsonb_typeof(p_policy->'lateCancellationChargeDisclosure') is distinct from 'string'
      or length(trim(coalesce(p_policy->>'lateCancellationChargeDisclosure',''))) < 10) then
    raise exception 'Late cancellation charge must be permitted and disclosed.' using errcode = '22023';
  end if;
  if length(coalesce(p_policy->>'lateCancellationChargeDisclosure','')) > 500 then raise exception 'Disclosure is too long.' using errcode = '22023'; end if;
  if (p_policy ? 'lateCancellationChargePermitted' and jsonb_typeof(p_policy->'lateCancellationChargePermitted') is distinct from 'boolean')
    or (p_policy ? 'lateCancellationChargeDisclosure' and jsonb_typeof(p_policy->'lateCancellationChargeDisclosure') is distinct from 'string') then
    raise exception 'Charge permission and disclosure have invalid types.' using errcode = '22023';
  end if;
end;
$function$;

create function vetit_appointments.assert_eligible(p_slot_id uuid, p_market_code text)
returns void language plpgsql set search_path = '' as $function$
begin
  if not exists (
    select 1 from public.appointment_slots s
    join public.service_offerings so on so.listing_id = s.service_listing_id and so.appointment_required
    join public.listings l on l.id = so.listing_id and l.kind = 'service' and l.moderation_status = 'published' and l.archived_at is null
    join public.businesses b on b.id = l.business_id and b.is_active and b.archived_at is null and b.verification_status = 'verified'
    join public.categories c on c.id = l.category_id and c.kind in ('service','both') and c.moderation_status = 'active'
    join public.listing_markets lm on lm.listing_id = l.id and lm.market_code = p_market_code and lm.availability_status = 'available' and lm.compliance_status = 'approved'
    join public.markets m on m.country_code = lm.market_code and m.market_status = 'active'
    where s.id = p_slot_id and s.starts_at > now()
      and (so.provider_location_id is null or exists (
        select 1 from public.provider_locations pl where pl.id = so.provider_location_id and pl.business_id = b.id and pl.is_active
      ))
      and not exists (select 1 from public.service_availability_exceptions e where e.service_listing_id = l.id and e.is_unavailable and e.starts_at < s.ends_at and e.ends_at > s.starts_at)
  ) then raise exception 'Service or slot is unavailable.' using errcode = '22023'; end if;
end;
$function$;

create function vetit_appointments.notify(p_customer uuid, p_key text, p_type text, p_payload jsonb)
returns void language plpgsql set search_path = '' as $function$
declare notification_id uuid;
begin
  insert into vetit_appointments.notifications(recipient_profile_id, deduplication_key, event_type, payload)
    values (p_customer, p_key, p_type, p_payload) on conflict (recipient_profile_id, deduplication_key) do nothing returning id into notification_id;
  if notification_id is not null then
    insert into vetit_appointments.notification_outbox(notification_id,channel)
      values (notification_id,'email'),(notification_id,'push');
  end if;
end;
$function$;

create function vetit_appointments.record_event(p_booking_id uuid, p_type text, p_details jsonb default '{}')
returns void language plpgsql set search_path = '' as $function$
declare b public.bookings%rowtype; event_id uuid; member record;
begin
  select * into strict b from public.bookings where id = p_booking_id;
  insert into vetit_appointments.events(booking_id, business_id, customer_profile_id, actor_profile_id, event_type, details)
    values (b.id, b.provider_business_id, b.customer_profile_id, auth.uid(), p_type, p_details) returning id into event_id;
  perform vetit_appointments.notify(b.customer_profile_id, event_id::text, p_type, jsonb_build_object('bookingId', b.id));
  for member in select profile_id from public.business_memberships where business_id = b.provider_business_id and member_role in ('owner','admin') and membership_status = 'active' loop
    perform vetit_appointments.notify(member.profile_id, event_id::text, p_type, jsonb_build_object('bookingId', b.id));
  end loop;
end;
$function$;

-- Caller already holds the provider business lock. FIFO is deterministic and
-- an offer reserves the slot in the same transaction as the cancellation.
create function vetit_appointments.offer_slot(p_slot_id uuid)
returns void language plpgsql set search_path = '' as $function$
declare s public.appointment_slots%rowtype; w vetit_appointments.waitlist%rowtype; p jsonb; offer_id uuid; expiry timestamptz; price bigint; currency char(3);
begin
  select * into s from public.appointment_slots where id = p_slot_id for update;
  if not found or s.status <> 'available' or s.starts_at <= now() then return; end if;
  select policy into p from vetit_appointments.policies where service_listing_id = s.service_listing_id;
  if p is null then return; end if;
  select candidate.* into w from vetit_appointments.waitlist candidate where candidate.service_listing_id = s.service_listing_id and candidate.status = 'waiting'
    and candidate.starts_at <= s.starts_at and candidate.ends_at >= s.ends_at
    and exists (select 1 from public.markets m join public.listing_markets lm on lm.market_code = m.country_code and lm.listing_id = s.service_listing_id
      where m.country_code = candidate.market_code and m.market_status = 'active' and lm.availability_status = 'available' and lm.compliance_status = 'approved'
        and exists (select 1 from public.listing_prices lp where lp.listing_id = s.service_listing_id and lp.market_code = m.country_code and lp.currency_code = m.currency_code
          and lp.product_variant_id is null and lp.status = 'active' and lp.valid_from <= now() and (lp.valid_to is null or lp.valid_to > now())))
    order by candidate.created_at, candidate.id limit 1 for update of candidate;
  if not found then return; end if;
  begin
    perform vetit_appointments.assert_eligible(s.id, w.market_code);
  exception when sqlstate '22023' then return;
  end;
  select lp.amount_minor, m.currency_code into price, currency from public.listing_prices lp
    join public.markets m on m.country_code = lp.market_code and m.market_status = 'active' and m.currency_code = lp.currency_code
    where lp.listing_id = s.service_listing_id and lp.market_code = w.market_code and lp.product_variant_id is null
      and lp.status = 'active' and lp.valid_from <= now() and (lp.valid_to is null or lp.valid_to > now())
    order by lp.valid_from desc,lp.created_at desc,lp.id limit 1;
  if price is null then return; end if;
  expiry := least(s.starts_at, now() + ((p->>'offerExpiryMinutes')::integer * interval '1 minute'));
  insert into vetit_appointments.offers(entry_id, slot_id, business_id, customer_profile_id, expires_at, policy_snapshot, price_minor, currency_code)
    values (w.id, s.id, w.business_id, w.customer_profile_id, expiry, p, price, currency) returning id into offer_id;
  update vetit_appointments.waitlist set status = 'offered' where id = w.id;
  update public.appointment_slots set status = 'held', hold_expires_at = expiry where id = s.id;
  perform vetit_appointments.notify(w.customer_profile_id, offer_id::text, 'slot_offered', jsonb_build_object('offerId', offer_id, 'slotId', s.id, 'expiresAt', expiry));
end;
$function$;

create function vetit_appointments.expire_offers(p_business_id uuid)
returns void language plpgsql set search_path = '' as $function$
declare o record;
begin
  for o in select f.*, s.starts_at from vetit_appointments.offers f join public.appointment_slots s on s.id = f.slot_id
    where f.business_id = p_business_id and f.status = 'offered' and f.expires_at <= now()
    order by f.expires_at, f.id limit 100 for update of f loop
    update vetit_appointments.offers set status = 'expired' where id = o.id;
    update vetit_appointments.waitlist set status = 'expired' where id = o.entry_id;
    update public.appointment_slots set status = case when starts_at > now() then 'available' else 'cancelled' end, hold_expires_at = null
      where id = o.slot_id and status = 'held';
    perform vetit_appointments.notify(o.customer_profile_id, o.id::text || ':expired', 'offer_expired', jsonb_build_object('offerId', o.id));
    perform vetit_appointments.offer_slot(o.slot_id);
  end loop;
  for o in select * from vetit_appointments.waitlist where business_id = p_business_id and status = 'waiting' and ends_at <= now() order by ends_at,id limit 100 for update loop
    update vetit_appointments.waitlist set status = 'expired' where id = o.id;
    perform vetit_appointments.notify(o.customer_profile_id, o.id::text || ':expired', 'waitlist_expired', jsonb_build_object('entryId',o.id));
  end loop;
end;
$function$;

create function vetit_appointments.cancel_booking(p_booking_id uuid, p_provider boolean)
returns void language plpgsql set search_path = '' as $function$
declare b public.bookings%rowtype; policy jsonb; timely boolean; basis_points integer; captured bigint; authorized boolean; pending boolean; old_slot uuid; refund bigint;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if b.status = 'cancelled' then return; end if;
  if b.status not in ('requested','confirmed') then raise exception 'Booking cannot be cancelled.' using errcode = '22023'; end if;
  policy := b.lifecycle_policy_snapshot;
  if not p_provider then
    perform vetit_appointments.assert_policy(policy);
    timely := now() <= b.requested_start - ((policy->>'noticeMinutes')::integer * interval '1 minute');
    if not (policy->>'allowCustomerCancellation')::boolean or b.requested_start <= now()
      or (not timely and not (policy->>'allowLateCancellation')::boolean) then
      raise exception 'Cancellation policy does not permit this request.' using errcode = '22023';
    end if;
  end if;
  basis_points := case when p_provider then 10000 when timely then (policy->>'refundBasisPoints')::integer else (policy->>'lateRefundBasisPoints')::integer end;
  perform 1 from public.payments where booking_id = b.id for update;
  select coalesce(sum(amount_minor) filter (where status = 'captured'),0), coalesce(bool_or(status = 'authorized'),false), coalesce(bool_or(status = 'pending'),false)
    into captured, authorized, pending from public.payments where booking_id = b.id;
  -- Do not silently calculate refunds across inconsistent currencies.
  if exists (select 1 from public.payments where booking_id = b.id and currency_code <> b.currency_code and status in ('captured','authorized','pending')) then
    raise exception 'Payment currency requires reconciliation.' using errcode = '22023';
  end if;
  refund := floor(captured::numeric * basis_points / 10000)::bigint;
  insert into vetit_appointments.refund_requests(booking_id, customer_profile_id, business_id, refund_minor, proposed_retained_minor, charge_status, currency_code, action, status)
    values (b.id, b.customer_profile_id, b.provider_business_id, refund, captured - refund, case when captured > refund then 'review_required' else 'not_collected' end, b.currency_code,
      case when pending or (authorized and captured > 0) then 'review' when refund > 0 then 'refund' when authorized then 'void' else 'none' end,
      case when pending or authorized or refund > 0 then 'review_required' else 'not_required' end);
  old_slot := b.appointment_slot_id;
  -- Retain the slot identity and dates in immutable history; the existing unique
  -- slot index stays intact while the cancelled booking releases its reference.
  update public.bookings set status = 'cancelled', appointment_slot_id = null, lifecycle_revision = lifecycle_revision + 1, updated_at = now() where id = b.id;
  perform vetit_appointments.record_event(b.id, 'cancelled', jsonb_build_object('slotId', old_slot, 'startsAt', b.requested_start, 'endsAt', b.requested_end, 'refundRequestedMinor', refund, 'providerCancellation', p_provider));
  if old_slot is not null then
    update public.appointment_slots set status = case when p_provider or starts_at <= now() then 'cancelled' else 'available' end, hold_expires_at = null where id = old_slot;
    if not p_provider then perform vetit_appointments.offer_slot(old_slot); end if;
  end if;
end;
$function$;

create function vetit_appointments.command(p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare actor uuid := auth.uid(); action text := p_command->>'action'; v_business_id uuid; v_service_id uuid;
  v_slot_id uuid; v_booking_id uuid; v_entry_id uuid; v_offer_id uuid; v_old_slot uuid; v_new_id uuid; v_market_code text;
  b public.bookings%rowtype; s public.appointment_slots%rowtype; o vetit_appointments.offers%rowtype;
  w vetit_appointments.waitlist%rowtype; policy jsonb; start_time timestamptz; end_time timestamptz; resource text; v_provider_cancellation boolean := false;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' or action is null then raise exception 'Command required.' using errcode = '22023'; end if;
  if action = 'readNotification' then
    update vetit_appointments.notifications set read_at = coalesce(read_at, now()) where id = (p_command->>'notificationId')::uuid and recipient_profile_id = actor;
    if not found then raise exception 'Notification not found.' using errcode = 'P0002'; end if;
    return jsonb_build_object('status','read');
  end if;
  if action in ('book','scheduleSlot','blockSlot','reopenSlot','joinWaitlist','setPolicy') then
    if action in ('book','blockSlot','reopenSlot') then
      v_slot_id := (p_command->>'slotId')::uuid;
      select service_listing_id into v_service_id from public.appointment_slots where id = v_slot_id;
    else v_service_id := (p_command->>'serviceListingId')::uuid; end if;
    select l.business_id into v_business_id from public.listings l where l.id = v_service_id;
  elsif action in ('cancel','reschedule','confirm','complete') then
    v_booking_id := (p_command->>'bookingId')::uuid;
    select * into b from public.bookings where id = v_booking_id;
    v_business_id := b.provider_business_id; v_service_id := b.service_listing_id;
  elsif action in ('acceptOffer','declineOffer') then
    v_offer_id := (p_command->>'offerId')::uuid;
    select * into o from vetit_appointments.offers where id = v_offer_id and customer_profile_id = actor;
    v_business_id := o.business_id;
  elsif action = 'leaveWaitlist' then
    v_entry_id := (p_command->>'entryId')::uuid;
    select * into w from vetit_appointments.waitlist where id = v_entry_id and customer_profile_id = actor;
    v_business_id := w.business_id;
  else raise exception 'Unsupported command.' using errcode = '22023'; end if;
  if v_business_id is null then raise exception 'Appointment not found.' using errcode = 'P0002'; end if;
  -- Shared lock order begins with the provider business before any slot/booking.
  -- Every lifecycle allocation and schedule write serializes on this same row.
  perform 1 from public.businesses where id = v_business_id for update;
  if v_service_id is not null and action in ('book','scheduleSlot','blockSlot','reopenSlot','joinWaitlist','setPolicy') then
    perform 1 from public.listings l where l.id = v_service_id and l.business_id = v_business_id for share;
    if not found then raise exception 'Provider identity changed; refresh.' using errcode = '40001'; end if;
  end if;
  if action = 'cancel' then
    if p_command ? 'providerCancellation' and jsonb_typeof(p_command->'providerCancellation') <> 'boolean' then
      raise exception 'Cancellation mode must be boolean.' using errcode = '22023';
    end if;
    -- A requested provider mode is intent, never proof of membership.
    v_provider_cancellation := b.customer_profile_id <> actor or coalesce((p_command->>'providerCancellation')::boolean, false);
    if v_provider_cancellation then perform vetit_appointments.assert_manager(v_business_id); end if;
  end if;
  if action in ('scheduleSlot','blockSlot','reopenSlot','setPolicy','confirm','complete') then
    perform vetit_appointments.assert_manager(v_business_id);
  elsif action in ('cancel','reschedule') and b.customer_profile_id <> actor then
    if action = 'reschedule' then raise exception 'Only the customer may reschedule.' using errcode = '42501'; end if;
    perform vetit_appointments.assert_manager(v_business_id);
  end if;
  if v_booking_id is not null then
    select * into b from public.bookings where id = v_booking_id for update;
    if p_command ? 'expectedRevision' and b.lifecycle_revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'Booking changed; refresh before changing it.' using errcode = '40001';
    end if;
  end if;
  perform vetit_appointments.expire_offers(v_business_id);

  if action = 'setPolicy' then
    perform vetit_appointments.assert_policy(p_command->'policy');
    insert into vetit_appointments.policies(service_listing_id, business_id, policy) values (v_service_id, v_business_id, p_command->'policy')
      on conflict (service_listing_id) do update set policy = excluded.policy, updated_at = now();
    return jsonb_build_object('status','saved');
  elsif action = 'scheduleSlot' then
    if not exists (select 1 from public.service_offerings where listing_id = v_service_id and appointment_required) then raise exception 'Service must accept appointments.' using errcode = '22023'; end if;
    if coalesce(p_command->>'startsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p_command->>'endsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Timezone is required.' using errcode = '22023'; end if;
    start_time := (p_command->>'startsAt')::timestamptz; end_time := (p_command->>'endsAt')::timestamptz;
    resource := coalesce(p_command->>'resourceKey','default');
    if start_time is null or end_time is null or start_time <= now() or end_time <= start_time or end_time - start_time > interval '1 day'
      or resource !~ '^[a-zA-Z0-9_-]{1,80}$' then raise exception 'Slot window is invalid.' using errcode = '22023'; end if;
    if exists (select 1 from public.appointment_slots x join public.listings l on l.id = x.service_listing_id where l.business_id = v_business_id
      and x.lifecycle_resource_key = resource and x.status <> 'cancelled' and x.starts_at < end_time and x.ends_at > start_time) then
      raise exception 'Resource is already scheduled.' using errcode = '40001'; end if;
    insert into public.appointment_slots(service_listing_id, starts_at, ends_at, lifecycle_resource_key) values (v_service_id, start_time, end_time, resource) returning id into v_slot_id;
    perform vetit_appointments.offer_slot(v_slot_id);
    return jsonb_build_object('slotId',v_slot_id);
  elsif action in ('blockSlot','reopenSlot') then
    select * into s from public.appointment_slots where id = v_slot_id for update;
    if s.status = 'booked' or exists(select 1 from public.bookings active where active.appointment_slot_id=s.id and active.status in ('requested','confirmed')) then
      raise exception 'Cancel the booking before changing its slot.' using errcode = '40001'; end if;
    if s.status = 'held' and not exists(select 1 from vetit_appointments.offers f where f.slot_id=s.id and f.status='offered') then
      raise exception 'Historical hold requires approved reconciliation before schedule changes.' using errcode = '40001'; end if;
    if action = 'blockSlot' then
      for o in select * from vetit_appointments.offers f where f.slot_id = s.id and status = 'offered' loop
        update vetit_appointments.offers set status = 'declined' where id = o.id;
        update vetit_appointments.waitlist set status = 'waiting' where id = o.entry_id;
        perform vetit_appointments.notify(o.customer_profile_id, o.id::text || ':withdrawn', 'offer_withdrawn', jsonb_build_object('offerId',o.id));
      end loop;
      update public.appointment_slots set status = 'cancelled', hold_expires_at = null where id = s.id;
    else
      if s.status <> 'cancelled' or s.starts_at <= now() then raise exception 'Slot cannot be reopened.' using errcode = '22023'; end if;
      if exists (select 1 from public.appointment_slots x join public.listings l on l.id = x.service_listing_id where l.business_id = v_business_id and x.id <> s.id
        and x.lifecycle_resource_key = s.lifecycle_resource_key and x.status <> 'cancelled' and x.starts_at < s.ends_at and x.ends_at > s.starts_at) then
        raise exception 'Resource is already scheduled.' using errcode = '40001'; end if;
      update public.appointment_slots set status = 'available' where id = s.id;
      perform vetit_appointments.offer_slot(s.id);
    end if;
    select * into s from public.appointment_slots where id = v_slot_id;
    return jsonb_build_object('slotId',s.id,'status',s.status);
  elsif action = 'joinWaitlist' then
    if coalesce(p_command->>'startsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p_command->>'endsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Timezone is required.' using errcode = '22023'; end if;
    start_time := (p_command->>'startsAt')::timestamptz; end_time := (p_command->>'endsAt')::timestamptz;
    if start_time is null or end_time is null or start_time < now() - interval '1 minute' or end_time <= start_time or end_time - start_time > interval '31 days' then
      raise exception 'Waiting-list window is invalid.' using errcode = '22023'; end if;
    v_market_code := coalesce(p_command->>'marketCode','IN');
    if not exists (select 1 from public.listings l join public.businesses pb on pb.id = l.business_id join public.service_offerings so on so.listing_id = l.id
      join public.categories c on c.id = l.category_id and c.moderation_status = 'active' and c.kind in ('service','both')
      join public.listing_markets lm on lm.listing_id = l.id and lm.market_code = v_market_code and lm.availability_status = 'available' and lm.compliance_status = 'approved'
      join public.markets m on m.country_code = lm.market_code and m.market_status = 'active'
      where l.id = v_service_id and so.appointment_required and l.moderation_status = 'published' and l.archived_at is null and pb.is_active and pb.verification_status = 'verified' and pb.archived_at is null) then
      raise exception 'Service is unavailable.' using errcode = '22023'; end if;
    if not exists (select 1 from vetit_appointments.policies where service_listing_id = v_service_id) then raise exception 'Provider must configure policy first.' using errcode = '22023'; end if;
    select id into v_entry_id from vetit_appointments.waitlist where customer_profile_id = actor and service_listing_id = v_service_id and status in ('waiting','offered');
    if v_entry_id is not null then return jsonb_build_object('entryId',v_entry_id); end if;
    insert into vetit_appointments.waitlist(customer_profile_id, service_listing_id, business_id, starts_at, ends_at, market_code)
      values (actor, v_service_id, v_business_id, start_time, end_time, v_market_code) returning id into v_entry_id;
    for s in select * from public.appointment_slots where service_listing_id = v_service_id and status = 'available' and starts_at >= start_time and ends_at <= end_time and starts_at > now()
      order by starts_at, id limit 100 loop perform vetit_appointments.offer_slot(s.id); end loop;
    return jsonb_build_object('entryId',v_entry_id);
  elsif action = 'leaveWaitlist' then
    select * into w from vetit_appointments.waitlist where id = v_entry_id and customer_profile_id = actor for update;
    if w.status in ('accepted','left','expired') then return jsonb_build_object('status',w.status); end if;
    update vetit_appointments.waitlist set status = 'left' where id = w.id;
    for o in select * from vetit_appointments.offers f where f.entry_id = w.id and status = 'offered' loop
      update vetit_appointments.offers set status = 'declined' where id = o.id;
      update public.appointment_slots set status = 'available', hold_expires_at = null where id = o.slot_id and status = 'held';
      perform vetit_appointments.offer_slot(o.slot_id);
    end loop;
    return jsonb_build_object('status','left');
  elsif action in ('acceptOffer','declineOffer') then
    select * into o from vetit_appointments.offers where id = v_offer_id and customer_profile_id = actor for update;
    if action = 'acceptOffer' and o.status = 'accepted' then return jsonb_build_object('bookingId',o.booking_id); end if;
    if o.status <> 'offered' or o.expires_at <= now() then raise exception 'Offer expired or changed.' using errcode = '40001'; end if;
    select * into s from public.appointment_slots where id = o.slot_id for update;
    if s.status <> 'held' then raise exception 'Offer slot changed.' using errcode = '40001'; end if;
    update vetit_appointments.offers set status = case when action = 'acceptOffer' then 'accepted' else 'declined' end where id = o.id;
    update public.appointment_slots set status = 'available', hold_expires_at = null where id = s.id;
    if action = 'declineOffer' then
      update vetit_appointments.waitlist set status = 'left' where id = o.entry_id;
      perform vetit_appointments.offer_slot(s.id);
      return jsonb_build_object('status','declined');
    end if;
    v_slot_id := s.id; v_service_id := s.service_listing_id;
    select wl.market_code into v_market_code from vetit_appointments.waitlist wl where wl.id = o.entry_id;
  elsif action = 'cancel' then
    perform vetit_appointments.cancel_booking(v_booking_id, v_provider_cancellation);
    return jsonb_build_object('bookingId',v_booking_id,'status','cancelled');
  elsif action in ('confirm','complete') then
    select * into b from public.bookings where id = v_booking_id for update;
    if b.status = (case when action = 'confirm' then 'confirmed' else 'completed' end) then return jsonb_build_object('bookingId',b.id,'status',b.status); end if;
    if (action = 'confirm' and b.status <> 'requested') or (action = 'complete' and (b.status <> 'confirmed' or b.requested_end > now())) then
      raise exception 'Booking status cannot advance.' using errcode = '22023'; end if;
    update public.bookings set status = case when action = 'confirm' then 'confirmed' else 'completed' end, lifecycle_revision = lifecycle_revision + 1, updated_at = now() where id = b.id;
    perform vetit_appointments.record_event(b.id, action, '{}');
    return jsonb_build_object('bookingId',b.id,'status',case when action = 'confirm' then 'confirmed' else 'completed' end);
  elsif action = 'reschedule' then
    select * into b from public.bookings where id = v_booking_id for update;
    v_slot_id := (p_command->>'slotId')::uuid;
    if b.status not in ('requested','confirmed') then raise exception 'Booking cannot be rescheduled.' using errcode = '22023'; end if;
    if b.appointment_slot_id = v_slot_id then return jsonb_build_object('bookingId',b.id); end if;
    policy := b.lifecycle_policy_snapshot; perform vetit_appointments.assert_policy(policy);
    if not (policy->>'allowReschedule')::boolean or b.requested_start <= now()
      or now() > b.requested_start - ((policy->>'noticeMinutes')::integer * interval '1 minute') then
      raise exception 'Rescheduling policy does not permit this request.' using errcode = '22023'; end if;
    select * into s from public.appointment_slots where id = v_slot_id and service_listing_id = b.service_listing_id for update;
    if not found or s.service_listing_id <> b.service_listing_id or s.status <> 'available' then raise exception 'Replacement slot is unavailable.' using errcode = '40001'; end if;
    perform 1 from public.service_offerings so where so.listing_id = b.service_listing_id and so.provider_location_id is not distinct from b.provider_location_id for share;
    if not found then raise exception 'Service location changed; review a new booking.' using errcode = '40001'; end if;
    perform vetit_appointments.assert_eligible(s.id, policy->>'marketCode');
    v_old_slot := b.appointment_slot_id;
    update public.appointment_slots set status = 'booked', hold_expires_at = null where id = s.id;
    -- Keep the agreed service/price/currency, original policy and payment links.
    update public.bookings set appointment_slot_id = s.id, requested_start = s.starts_at, requested_end = s.ends_at, lifecycle_revision = lifecycle_revision + 1, updated_at = now() where id = b.id;
    perform vetit_appointments.record_event(b.id, 'rescheduled', jsonb_build_object('oldSlotId',v_old_slot,'oldStart',b.requested_start,'oldEnd',b.requested_end,'slotId',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at));
    if v_old_slot is not null then
      update public.appointment_slots set status = 'available', hold_expires_at = null where id = v_old_slot;
      perform vetit_appointments.offer_slot(v_old_slot);
    end if;
    return jsonb_build_object('bookingId',b.id);
  end if;

  -- Common booking path also accepts a reservation held by this exact customer.
  if action in ('book','acceptOffer') then
    select * into s from public.appointment_slots where id = v_slot_id for update;
    if action = 'book' and s.status = 'booked' then
      select id into v_booking_id from public.bookings where appointment_slot_id = s.id and customer_profile_id = actor and status in ('requested','confirmed');
      if v_booking_id is not null then return jsonb_build_object('bookingId',v_booking_id); end if;
    end if;
    if s.status <> 'available' then raise exception 'Slot is no longer available.' using errcode = '40001'; end if;
    if action = 'acceptOffer' then policy := o.policy_snapshot;
    else select p.policy into policy from vetit_appointments.policies p where p.service_listing_id = s.service_listing_id; end if;
    perform vetit_appointments.assert_policy(policy);
    if p_command ? 'expectedPolicy' and policy <> p_command->'expectedPolicy' then raise exception 'Appointment terms changed; review them again.' using errcode = '40001'; end if;
    v_market_code := coalesce(v_market_code, p_command->>'marketCode','IN');
    perform vetit_appointments.assert_eligible(s.id, v_market_code);
    v_booking_id := vetit_appointments.book_my_appointment(s.id, v_market_code);
    select * into b from public.bookings where id = v_booking_id;
    if (action = 'acceptOffer' and (b.price_minor <> o.price_minor or b.currency_code <> o.currency_code))
      or (p_command ? 'expectedPriceMinor' and (b.price_minor <> (p_command->>'expectedPriceMinor')::bigint or b.currency_code <> p_command->>'expectedCurrencyCode')) then
      raise exception 'Appointment price changed; refresh the quote.' using errcode = '40001';
    end if;
    update public.bookings set lifecycle_policy_snapshot = policy || jsonb_build_object('marketCode',v_market_code) where id = v_booking_id;
    perform vetit_appointments.record_event(v_booking_id, 'booked', jsonb_build_object('slotId',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at));
    if action = 'acceptOffer' then
      update vetit_appointments.offers set booking_id = v_booking_id where id = o.id;
      update vetit_appointments.waitlist set status = 'accepted' where id = o.entry_id;
    end if;
    return jsonb_build_object('bookingId',v_booking_id);
  end if;
  raise exception 'Unsupported command.' using errcode = '22023';
end;
$function$;

create function public.appointment_lifecycle_command(p_command jsonb)
returns jsonb language sql security definer set search_path = '' as $function$
  select vetit_appointments.command(p_command);
$function$;
create function public.book_my_appointment(p_appointment_slot_id uuid, p_market_code text default 'IN')
returns uuid language sql security definer set search_path = '' as $function$
  select (vetit_appointments.command(jsonb_build_object('action','book','slotId',p_appointment_slot_id,'marketCode',p_market_code))->>'bookingId')::uuid;
$function$;

create function public.appointment_lifecycle_dashboard(p_business_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_business_id is not null then perform vetit_appointments.assert_manager(p_business_id); end if;
  -- GET is read-only: background expiry is handled by the worker, never a GET.
  with visible_bookings as (
    select b.* from public.bookings b where (p_business_id is null and b.customer_profile_id = actor) or (p_business_id is not null and b.provider_business_id = p_business_id)
    order by b.created_at desc, b.id limit 201
  ) select jsonb_build_object(
    'bookings',coalesce((select jsonb_agg(to_jsonb(b)) from (select * from visible_bookings limit 200) b),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from vetit_appointments.events where booking_id in (select id from visible_bookings) order by created_at desc,id limit 500) e),'[]'),
    'waitlist',coalesce((select jsonb_agg(to_jsonb(w)) from (select * from vetit_appointments.waitlist where customer_profile_id = actor order by created_at desc,id limit 200) w),'[]'),
    'offers',coalesce((select jsonb_agg(to_jsonb(o)) from (select f.*,s.starts_at,s.ends_at from vetit_appointments.offers f join public.appointment_slots s on s.id = f.slot_id where f.customer_profile_id = actor order by f.created_at desc,f.id limit 200) o),'[]'),
    'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from (select * from vetit_appointments.notifications where recipient_profile_id = actor order by created_at desc,id limit 200) n),'[]'),
    'providerBusinesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'display_name',b.display_name)) from public.businesses b join public.business_memberships m on m.business_id = b.id where m.profile_id = actor and m.member_role in ('owner','admin') and m.membership_status = 'active'),'[]'),
    'services',case when p_business_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title)) from public.listings l join public.service_offerings so on so.listing_id = l.id where l.business_id = p_business_id),'[]') end,
    'slots',case when p_business_id is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(s)) from (select s.* from public.appointment_slots s join public.listings l on l.id = s.service_listing_id where l.business_id = p_business_id and s.starts_at >= now() - interval '1 day' and s.starts_at < now() + interval '31 days' order by s.starts_at,s.id limit 200) s),'[]') end,
    'policies',case when p_business_id is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(p)) from vetit_appointments.policies p where p.business_id = p_business_id),'[]') end,
    'payments',coalesce((select jsonb_agg(jsonb_build_object('booking_id',p.booking_id,'status',p.status,'amount_minor',p.amount_minor,'currency_code',p.currency_code)) from public.payments p where p.booking_id in (select id from visible_bookings)),'[]'),
    'refunds',coalesce((select jsonb_agg(to_jsonb(r)) from vetit_appointments.refund_requests r where r.booking_id in (select id from visible_bookings)),'[]'),
    'truncated',(select count(*) > 200 from visible_bookings)
  ) into result;
  return result;
end;
$function$;

create function public.appointment_lifecycle_policy(p_service_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare result jsonb;
begin
  select jsonb_build_object('policy',p.policy,'title',l.title,'priceMinor',lp.amount_minor,'currencyCode',lp.currency_code) into result
  from vetit_appointments.policies p join public.listings l on l.id = p.service_listing_id
  join public.businesses b on b.id = l.business_id and b.is_active and b.archived_at is null and b.verification_status = 'verified'
  join public.categories c on c.id = l.category_id and c.moderation_status = 'active' and c.kind in ('service','both')
  join public.service_offerings so on so.listing_id = l.id and so.appointment_required
  join lateral (
    select lp.amount_minor,lp.currency_code from public.listing_prices lp join public.markets m on m.country_code = lp.market_code and m.market_status = 'active' and m.currency_code = lp.currency_code
    join public.listing_markets lm on lm.listing_id = lp.listing_id and lm.market_code = lp.market_code and lm.availability_status = 'available' and lm.compliance_status = 'approved'
    where lp.listing_id = l.id and lp.market_code = 'IN' and lp.product_variant_id is null and lp.status = 'active'
      and lp.valid_from <= now() and (lp.valid_to is null or lp.valid_to > now()) order by lp.valid_from desc,lp.created_at desc,lp.id limit 1
  ) lp on true
  where l.id = p_service_listing_id and l.kind = 'service' and l.moderation_status = 'published' and l.archived_at is null;
  if result is null then raise exception 'Service policy is unavailable.' using errcode = 'P0002'; end if;
  return result;
end;
$function$;

-- Worker RPC: service_role only; no HTTP worker endpoint, secret or cron is added.
-- A separately approved scheduler must call this regularly for unattended expiry.
create function public.appointment_lifecycle_tick()
returns integer language plpgsql security definer set search_path = '' as $function$
declare business record; count_businesses integer := 0;
begin
  for business in select business_id from (
    select business_id from vetit_appointments.offers where status = 'offered' and expires_at <= now()
    union select business_id from vetit_appointments.waitlist where status = 'waiting' and ends_at <= now()
  ) expired order by business_id limit 100 loop
    perform 1 from public.businesses where id = business.business_id for update;
    perform vetit_appointments.expire_offers(business.business_id);
    count_businesses := count_businesses + 1;
  end loop;
  return count_businesses;
end;
$function$;

-- Initial policy explicitly approved by the user: changes are free up to 24h
-- beforehand. Refunds are requested for review, never automatically executed.
insert into vetit_appointments.policies(service_listing_id,business_id,policy)
  select so.listing_id,l.business_id,'{"allowCustomerCancellation":true,"allowReschedule":true,"allowLateCancellation":false,"noticeMinutes":1440,"refundBasisPoints":10000,"lateRefundBasisPoints":0,"offerExpiryMinutes":15,"lateCancellationChargePermitted":false,"lateCancellationChargeDisclosure":""}'::jsonb
  from public.service_offerings so join public.listings l on l.id = so.listing_id where so.appointment_required;

create function vetit_appointments.initialize_policy()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.appointment_required then
    insert into vetit_appointments.policies(service_listing_id,business_id,policy)
      select new.listing_id,l.business_id,'{"allowCustomerCancellation":true,"allowReschedule":true,"allowLateCancellation":false,"noticeMinutes":1440,"refundBasisPoints":10000,"lateRefundBasisPoints":0,"offerExpiryMinutes":15,"lateCancellationChargePermitted":false,"lateCancellationChargeDisclosure":""}'::jsonb
      from public.listings l where l.id = new.listing_id on conflict (service_listing_id) do nothing;
  end if;
  return new;
end;
$function$;
create trigger appointment_initialize_policy after insert or update of appointment_required on public.service_offerings
  for each row execute function vetit_appointments.initialize_policy();

revoke all on all functions in schema vetit_appointments from public, anon, authenticated;
revoke all on function public.appointment_lifecycle_command(jsonb) from public, anon, authenticated;
revoke all on function public.appointment_lifecycle_dashboard(uuid) from public, anon, authenticated;
revoke all on function public.book_my_appointment(uuid,text) from public, anon, authenticated;
revoke all on function public.appointment_lifecycle_tick() from public, anon, authenticated;
revoke all on function public.appointment_lifecycle_policy(uuid) from public, anon, authenticated;
grant execute on function public.appointment_lifecycle_command(jsonb), public.appointment_lifecycle_dashboard(uuid), public.book_my_appointment(uuid,text) to authenticated;
grant execute on function public.appointment_lifecycle_tick() to service_role;
grant execute on function public.appointment_lifecycle_policy(uuid) to anon, authenticated;
commit;
