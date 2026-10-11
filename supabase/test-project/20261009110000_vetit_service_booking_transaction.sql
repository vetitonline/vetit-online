-- Test-only proposal: reserve a pre-generated service appointment slot atomically.
-- Apply only after the commerce foundation proposal and an isolated PostgreSQL review.
-- No price, provider, slot or customer identity is trusted from the caller.

begin;

do $preflight$
begin
  if to_regclass('public.appointment_slots') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.service_offerings') is null
     or to_regclass('public.listing_prices') is null
     or to_regclass('public.listing_markets') is null then
    raise exception 'Vetit service booking prerequisites are missing; inspect the verified Test baseline.';
  end if;
  if exists (
    select 1 from public.bookings where appointment_slot_id is not null
    group by appointment_slot_id having count(*) > 1
  ) then
    raise exception 'An appointment slot has multiple bookings; reconcile before adding the unique index.';
  end if;
end;
$preflight$;

-- A slot can be assigned to at most one booking even if another privileged
-- writer accidentally leaves the slot status as available.
create unique index if not exists bookings_one_per_appointment_slot_idx
  on public.bookings(appointment_slot_id) where appointment_slot_id is not null;

create or replace function public.book_my_appointment(
  p_appointment_slot_id uuid,
  p_market_code text default 'IN'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid := auth.uid();
  market_row public.markets%rowtype;
  slot_row public.appointment_slots%rowtype;
  listing_row public.listings%rowtype;
  offering_row public.service_offerings%rowtype;
  provider_location_id uuid;
  service_price bigint;
  booking_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_appointment_slot_id is null or p_market_code is null or p_market_code !~ '^[A-Z]{2}$' then
    raise exception 'Appointment request is invalid.' using errcode = '22023';
  end if;

  select m.* into market_row
  from public.markets m
  where m.country_code = p_market_code and m.market_status = 'active'
  for share;
  if not found then raise exception 'Market is unavailable.' using errcode = '22023'; end if;

  select s.* into slot_row
  from public.appointment_slots s
  where s.id = p_appointment_slot_id
  for update;
  if not found then
    raise exception 'Appointment slot was not found.' using errcode = 'P0002';
  end if;
  -- A retry from the same buyer returns the existing active booking ID rather
  -- than creating a duplicate or reporting a misleading conflict.
  if slot_row.status = 'booked' then
    select b.id into booking_id from public.bookings b
    where b.appointment_slot_id = slot_row.id and b.customer_profile_id = requester_id
      and b.status in ('requested','confirmed');
    if booking_id is not null then return booking_id; end if;
  end if;
  if slot_row.status <> 'available' or slot_row.starts_at <= now() then
    raise exception 'Appointment slot is no longer available.' using errcode = '40001';
  end if;

  select l.* into listing_row
  from public.listings l
  join public.businesses b on b.id = l.business_id
  join public.categories c on c.id = l.category_id
  join public.listing_markets lm on lm.listing_id = l.id and lm.market_code = market_row.country_code
  where l.id = slot_row.service_listing_id
    and l.kind = 'service'
    and l.moderation_status = 'published'
    and l.archived_at is null
    and b.is_active and b.archived_at is null and b.verification_status = 'verified'
    and c.kind in ('service','both') and c.moderation_status = 'active'
    and lm.availability_status = 'available' and lm.compliance_status = 'approved'
  for share of l, b;
  if not found then raise exception 'Service is unavailable in this market.' using errcode = '22023'; end if;

  select so.* into offering_row
  from public.service_offerings so
  where so.listing_id = listing_row.id and so.appointment_required
  for share;
  if not found then raise exception 'This service does not accept appointment bookings.' using errcode = '22023'; end if;

  provider_location_id := offering_row.provider_location_id;
  if provider_location_id is not null and not exists (
    select 1 from public.provider_locations pl
    where pl.id = provider_location_id and pl.business_id = listing_row.business_id and pl.is_active
  ) then
    raise exception 'Service location is unavailable.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.service_availability_exceptions e
    where e.service_listing_id = listing_row.id and e.is_unavailable
      and e.starts_at < slot_row.ends_at and e.ends_at > slot_row.starts_at
  ) then
    raise exception 'Appointment slot is unavailable.' using errcode = '22023';
  end if;

  select lp.amount_minor into service_price
  from public.listing_prices lp
  where lp.listing_id = listing_row.id and lp.product_variant_id is null
    and lp.market_code = market_row.country_code and lp.currency_code = market_row.currency_code
    and lp.status = 'active' and lp.valid_from <= now() and (lp.valid_to is null or lp.valid_to > now())
  order by lp.valid_from desc, lp.created_at desc, lp.id
  limit 1
  for share;
  if service_price is null or service_price < 0 then
    raise exception 'Service has no current price for this market.' using errcode = '22023';
  end if;

  update public.appointment_slots
  set status = 'booked', hold_expires_at = null
  where id = slot_row.id and status = 'available';
  if not found then raise exception 'Appointment slot was claimed concurrently.' using errcode = '40001'; end if;

  insert into public.bookings (
    customer_profile_id, provider_business_id, provider_location_id, service_listing_id,
    appointment_slot_id, requested_start, requested_end, status, price_minor,
    currency_code, cancellation_policy_snapshot
  ) values (
    requester_id, listing_row.business_id, provider_location_id, listing_row.id,
    slot_row.id, slot_row.starts_at, slot_row.ends_at, 'requested', service_price,
    market_row.currency_code, offering_row.cancellation_policy
  ) returning id into booking_id;

  return booking_id;
end;
$function$;

revoke all on function public.book_my_appointment(uuid,text) from public, anon, authenticated;
grant execute on function public.book_my_appointment(uuid,text) to authenticated;

commit;
