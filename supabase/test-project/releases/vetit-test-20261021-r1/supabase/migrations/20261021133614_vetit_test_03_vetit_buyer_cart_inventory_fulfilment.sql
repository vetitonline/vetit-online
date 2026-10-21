-- Vetit Online Test-only buyer/cart/inventory/fulfilment transaction foundation.
-- Local proposal only; not executed against any database.
-- Order creation and payment initiation remain disabled pending approved India tax
-- and delivery pricing rules plus an isolated PostgreSQL concurrency test.

begin;

do $preflight$
begin
  if to_regclass('public.addresses') is null
     or to_regclass('public.carts') is null
     or to_regclass('public.cart_items') is null
     or to_regclass('public.inventory_levels') is null
     or to_regclass('public.inventory_movements') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.fulfilments') is null then
    raise exception 'Vetit commerce prerequisites are missing; inspect the verified Test baseline.';
  end if;
  if exists (select 1 from public.addresses where is_default group by profile_id having count(*) > 1) then
    raise exception 'Multiple default addresses exist; review before adding the partial unique index.';
  end if;
  if exists (select 1 from public.cart_items where product_variant_id is null group by cart_id, listing_id having count(*) > 1) then
    raise exception 'Duplicate base-product cart lines exist; review before adding the partial unique index.';
  end if;
  if exists (select 1 from public.payments where (order_id is null) = (booking_id is null)) then
    raise exception 'Payment rows with zero or two parents exist; review before enforcing the parent constraint.';
  end if;
  if exists (select 1 from public.payments where provider_payment_reference is not null
             group by provider, provider_payment_reference having count(*) > 1) then
    raise exception 'Duplicate provider payment references exist; review before enforcing idempotency.';
  end if;
end;
$preflight$;

create unique index if not exists addresses_one_default_per_profile_idx
  on public.addresses(profile_id) where is_default;
create unique index if not exists cart_items_one_base_line_idx
  on public.cart_items(cart_id, listing_id) where product_variant_id is null;
create unique index if not exists payments_provider_reference_unique_idx
  on public.payments(provider, provider_payment_reference)
  where provider_payment_reference is not null;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_total_components_check') then
    alter table public.orders add constraint orders_total_components_check
      check (total_minor = subtotal_minor + delivery_minor + tax_minor) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.payments'::regclass and conname = 'payments_exactly_one_parent_check') then
    alter table public.payments add constraint payments_exactly_one_parent_check
      check ((order_id is null) <> (booking_id is null)) not valid;
  end if;
end;
$constraints$;

-- Enforce the merchandise subtotal against immutable order-line snapshots at
-- transaction commit. Deferred triggers allow a future order RPC to create the
-- order and lines together without exposing an incomplete order.
create or replace function public.assert_order_totals()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
declare
  target_order_id uuid;
  saved_subtotal bigint;
  saved_total bigint;
  saved_components numeric;
  calculated_subtotal numeric;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then target_order_id := old.id; else target_order_id := new.id; end if;
  elsif tg_op = 'DELETE' then
    target_order_id := old.order_id;
  else
    target_order_id := new.order_id;
  end if;
  select o.subtotal_minor, o.total_minor,
         o.subtotal_minor::numeric + o.delivery_minor::numeric + o.tax_minor::numeric
    into saved_subtotal, saved_total, saved_components
  from public.orders o where o.id = target_order_id;
  if not found then return null; end if;
  select sum(oi.quantity::numeric * oi.unit_price_minor::numeric)
    into calculated_subtotal from public.order_items oi where oi.order_id = target_order_id;
  if calculated_subtotal is null or calculated_subtotal <> saved_subtotal::numeric
     or saved_total::numeric <> saved_components then
    raise exception 'Order totals do not match the order-line snapshots.' using errcode = '23514';
  end if;
  return null;
end;
$function$;

do $order_triggers$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_totals_integrity') then
    create constraint trigger orders_totals_integrity after insert or update on public.orders
      deferrable initially deferred for each row execute function public.assert_order_totals();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.order_items'::regclass and tgname = 'order_items_totals_integrity') then
    create constraint trigger order_items_totals_integrity after insert or update or delete on public.order_items
      deferrable initially deferred for each row execute function public.assert_order_totals();
  end if;
end;
$order_triggers$;
revoke all on function public.assert_order_totals() from public, anon, authenticated;

create table if not exists public.fulfilment_events (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null references public.fulfilments(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  previous_status text not null check (previous_status in ('pending','packed','shipped','delivered','cancelled')),
  new_status text not null check (new_status in ('pending','packed','shipped','delivered','cancelled')),
  created_at timestamptz not null default now(),
  check (previous_status <> new_status)
);
create index if not exists fulfilment_events_timeline_idx on public.fulfilment_events(fulfilment_id, created_at, id);
alter table public.fulfilment_events enable row level security;
revoke all on table public.fulfilment_events from public, anon, authenticated;
grant select on table public.fulfilment_events to authenticated;

do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fulfilment_events'
                 and policyname = 'fulfilment_events_read_participant') then
    execute $create_policy$
      create policy fulfilment_events_read_participant on public.fulfilment_events
      for select to authenticated using (
        exists (select 1 from public.fulfilments f join public.orders o on o.id = f.order_id
                where f.id = fulfilment_events.fulfilment_id and o.customer_profile_id = (select auth.uid()))
        or exists (select 1 from public.fulfilments f join public.business_memberships bm on bm.business_id = f.business_id
                   where f.id = fulfilment_events.fulfilment_id and bm.profile_id = (select auth.uid())
                     and bm.membership_status = 'active')
      )
    $create_policy$;
  end if;
end;
$policy$;

create or replace function public.save_my_address(
  p_address_id uuid, p_label text, p_recipient_name text, p_phone text,
  p_address_line1 text, p_address_line2 text, p_locality text, p_city text,
  p_state_region text, p_postal_code text, p_country_code text,
  p_latitude double precision, p_longitude double precision, p_is_default boolean
)
returns uuid language plpgsql security invoker set search_path = ''
as $function$
declare
  requester_id uuid := auth.uid();
  saved_id uuid;
begin
  if requester_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_recipient_name, ''))) not between 1 and 120
     or length(btrim(coalesce(p_address_line1, ''))) not between 1 and 200
     or length(btrim(coalesce(p_city, ''))) not between 1 and 120
     or p_country_code is null or p_country_code !~ '^[A-Z]{2}$'
     or coalesce(length(p_label), 0) > 40 or coalesce(length(p_phone), 0) > 32
     or coalesce(length(p_address_line2), 0) > 200 or coalesce(length(p_locality), 0) > 120
     or coalesce(length(p_state_region), 0) > 120 or coalesce(length(p_postal_code), 0) > 20
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'Address details are invalid.' using errcode = '22023';
  end if;

  if coalesce(p_is_default, false) then
    update public.addresses set is_default = false, updated_at = now()
    where profile_id = requester_id and is_default and id is distinct from p_address_id;
  end if;

  if p_address_id is null then
    insert into public.addresses (
      profile_id, label, recipient_name, phone, address_line1, address_line2,
      locality, city, state_region, postal_code, country_code, latitude, longitude, is_default
    ) values (
      requester_id, nullif(btrim(p_label), ''), btrim(p_recipient_name), nullif(btrim(p_phone), ''),
      btrim(p_address_line1), nullif(btrim(p_address_line2), ''), nullif(btrim(p_locality), ''),
      btrim(p_city), nullif(btrim(p_state_region), ''), nullif(btrim(p_postal_code), ''),
      p_country_code, p_latitude, p_longitude, coalesce(p_is_default, false)
    ) returning id into saved_id;
  else
    update public.addresses set
      label = nullif(btrim(p_label), ''), recipient_name = btrim(p_recipient_name), phone = nullif(btrim(p_phone), ''),
      address_line1 = btrim(p_address_line1), address_line2 = nullif(btrim(p_address_line2), ''),
      locality = nullif(btrim(p_locality), ''), city = btrim(p_city), state_region = nullif(btrim(p_state_region), ''),
      postal_code = nullif(btrim(p_postal_code), ''), country_code = p_country_code,
      latitude = p_latitude, longitude = p_longitude, is_default = coalesce(p_is_default, false), updated_at = now()
    where id = p_address_id and profile_id = requester_id returning id into saved_id;
    if saved_id is null then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$function$;

create or replace function public.set_my_cart_item(
  p_listing_id uuid, p_product_variant_id uuid, p_quantity integer, p_market_code text default 'IN'
)
returns uuid language plpgsql security invoker set search_path = ''
as $function$
declare
  requester_id uuid := auth.uid();
  market_row public.markets%rowtype;
  cart_id uuid;
  item_id uuid;
  listing_business_id uuid;
  priced_amount bigint;
begin
  if requester_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99
     or p_market_code is null or p_market_code !~ '^[A-Z]{2}$' then
    raise exception 'Cart item details are invalid.' using errcode = '22023';
  end if;
  select m.* into market_row from public.markets m
  where m.country_code = p_market_code and m.market_status = 'active' for share;
  if not found then raise exception 'Market is unavailable.' using errcode = '22023'; end if;

  insert into public.carts(profile_id, market_code, currency_code, status)
  values (requester_id, market_row.country_code, market_row.currency_code, 'active')
  on conflict (profile_id, market_code) where status = 'active' do nothing
  returning id into cart_id;
  if cart_id is null then
    select c.id into cart_id from public.carts c
    where c.profile_id = requester_id and c.market_code = market_row.country_code and c.status = 'active'
    for update;
  end if;
  if cart_id is null then raise exception 'Active cart could not be established.' using errcode = '40001'; end if;

  select l.business_id into listing_business_id
  from public.listings l
  join public.businesses b on b.id = l.business_id
  join public.categories c on c.id = l.category_id
  join public.listing_markets lm on lm.listing_id = l.id and lm.market_code = market_row.country_code
  where l.id = p_listing_id and l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null
    and b.is_active and b.archived_at is null and b.verification_status = 'verified'
    and c.kind in ('product','both') and c.moderation_status = 'active'
    and lm.availability_status = 'available' and lm.compliance_status = 'approved'
  for share of l, b;
  if listing_business_id is null then raise exception 'Product is unavailable in this market.' using errcode = '22023'; end if;

  if p_product_variant_id is not null then
    perform 1 from public.product_variants v
    where v.id = p_product_variant_id and v.listing_id = p_listing_id and v.active_status for share;
    if not found then raise exception 'Product option is unavailable.' using errcode = '22023'; end if;
  end if;

  select lp.amount_minor into priced_amount from public.listing_prices lp
  where lp.listing_id = p_listing_id and lp.product_variant_id is not distinct from p_product_variant_id
    and lp.market_code = market_row.country_code and lp.currency_code = market_row.currency_code
    and lp.status = 'active' and lp.valid_from <= now() and (lp.valid_to is null or lp.valid_to > now())
  order by lp.valid_from desc limit 1 for share;
  if priced_amount is null or priced_amount <= 0 then
    raise exception 'Product has no current price for this market and option.' using errcode = '22023';
  end if;

  if p_product_variant_id is null then
    insert into public.cart_items(cart_id, listing_id, product_variant_id, quantity)
    values (cart_id, p_listing_id, null, p_quantity)
    on conflict (cart_id, listing_id) where product_variant_id is null
    do update set quantity = excluded.quantity, updated_at = now()
    returning id into item_id;
  else
    insert into public.cart_items(cart_id, listing_id, product_variant_id, quantity)
    values (cart_id, p_listing_id, p_product_variant_id, p_quantity)
    on conflict (cart_id, listing_id, product_variant_id)
    do update set quantity = excluded.quantity, updated_at = now()
    returning id into item_id;
  end if;
  return item_id;
end;
$function$;

create or replace function public.remove_my_cart_item(p_cart_item_id uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $function$
declare removed_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  delete from public.cart_items ci using public.carts c
  where ci.id = p_cart_item_id and c.id = ci.cart_id and c.profile_id = auth.uid() and c.status = 'active'
  returning ci.id into removed_id;
  return removed_id;
end;
$function$;

create or replace function public.set_seller_inventory(
  p_business_id uuid, p_product_variant_id uuid, p_quantity_on_hand integer, p_stock_location text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  requester_id uuid := auth.uid();
  variant_business_id uuid;
  inventory_row public.inventory_levels%rowtype;
  delta integer;
begin
  if requester_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_quantity_on_hand is null or p_quantity_on_hand < 0 or p_quantity_on_hand > 10000000
     or coalesce(length(btrim(p_stock_location)), 0) > 100 then
    raise exception 'Inventory adjustment is invalid.' using errcode = '22023';
  end if;

  select l.business_id into variant_business_id
  from public.product_variants v join public.listings l on l.id = v.listing_id
  where v.id = p_product_variant_id and v.active_status and l.business_id = p_business_id
    and l.kind = 'product' and l.archived_at is null
  for share of v, l;
  if variant_business_id is null then raise exception 'Product option is unavailable.' using errcode = '22023'; end if;
  perform 1 from public.businesses b where b.id = p_business_id and b.is_active and b.archived_at is null for share;
  if not found then raise exception 'Seller business is inactive.' using errcode = '42501'; end if;
  perform 1 from public.business_memberships bm
  where bm.business_id = p_business_id and bm.profile_id = requester_id and bm.membership_status = 'active'
    and bm.member_role in ('owner','admin','fulfillment_manager') for share;
  if not found then raise exception 'Inventory access denied.' using errcode = '42501'; end if;

  insert into public.inventory_levels(business_id, product_variant_id, stock_location, quantity_on_hand)
  values (p_business_id, p_product_variant_id, nullif(btrim(p_stock_location), ''), 0)
  on conflict (business_id, product_variant_id, stock_location) do nothing;
  select il.* into inventory_row from public.inventory_levels il
  where il.business_id = p_business_id and il.product_variant_id = p_product_variant_id
    and il.stock_location is not distinct from nullif(btrim(p_stock_location), '')
  for update;
  if not found then raise exception 'Inventory row could not be locked.' using errcode = '40001'; end if;
  if p_quantity_on_hand < inventory_row.quantity_reserved then
    raise exception 'On-hand quantity cannot be lower than reserved stock.' using errcode = '23514';
  end if;

  delta := p_quantity_on_hand - inventory_row.quantity_on_hand;
  if delta <> 0 then
    update public.inventory_levels set quantity_on_hand = p_quantity_on_hand, updated_at = now() where id = inventory_row.id;
    insert into public.inventory_movements(inventory_level_id, product_variant_id, actor_profile_id, quantity_change, reason)
    values (inventory_row.id, p_product_variant_id, requester_id, delta, 'seller_stock_adjustment');
  end if;
  return inventory_row.id;
end;
$function$;

create or replace function public.advance_seller_fulfilment(
  p_fulfilment_id uuid, p_next_status text, p_carrier text default null, p_tracking_reference text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  requester_id uuid := auth.uid();
  fulfilment_row public.fulfilments%rowtype;
  current_order_status text;
begin
  if requester_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_next_status is null or p_next_status not in ('packed','shipped','delivered','cancelled')
     or coalesce(length(btrim(p_carrier)), 0) > 80
     or coalesce(length(btrim(p_tracking_reference)), 0) > 120 then
    raise exception 'Fulfilment update is invalid.' using errcode = '22023';
  end if;

  select f.* into fulfilment_row from public.fulfilments f where f.id = p_fulfilment_id for update;
  if not found then raise exception 'Fulfilment not found.' using errcode = 'P0002'; end if;
  perform 1 from public.businesses b join public.business_memberships bm on bm.business_id = b.id
  where b.id = fulfilment_row.business_id and b.is_active and b.archived_at is null
    and bm.profile_id = requester_id and bm.membership_status = 'active'
    and bm.member_role in ('owner','admin','fulfillment_manager')
  for share of b, bm;
  if not found then raise exception 'Fulfilment access denied.' using errcode = '42501'; end if;

  if fulfilment_row.status = p_next_status then
    if p_next_status = 'shipped' and (
      fulfilment_row.carrier is distinct from btrim(p_carrier)
      or fulfilment_row.tracking_reference is distinct from btrim(p_tracking_reference)
    ) then raise exception 'A shipped fulfilment cannot change its tracking identity.' using errcode = '22023'; end if;
    return p_fulfilment_id;
  end if;
  if not ((fulfilment_row.status = 'pending' and p_next_status in ('packed','cancelled'))
       or (fulfilment_row.status = 'packed' and p_next_status in ('shipped','cancelled'))
       or (fulfilment_row.status = 'shipped' and p_next_status = 'delivered')) then
    raise exception 'Fulfilment status transition is not allowed.' using errcode = '22023';
  end if;
  if p_next_status = 'shipped' then
    if coalesce(length(btrim(p_carrier)), 0) = 0 or coalesce(length(btrim(p_tracking_reference)), 0) = 0 then
      raise exception 'Carrier and tracking reference are required before shipment.' using errcode = '22023';
    end if;
    select o.order_status into current_order_status from public.orders o where o.id = fulfilment_row.order_id for share;
    if current_order_status not in ('confirmed','processing') then
      raise exception 'Only a confirmed order may ship.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.fulfilment_items fi where fi.fulfilment_id = p_fulfilment_id) then
      raise exception 'Shipment must contain at least one order item.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.fulfilment_items fi join public.order_items oi on oi.id = fi.order_item_id
      where fi.fulfilment_id = p_fulfilment_id
        and (oi.order_id <> fulfilment_row.order_id or oi.business_id <> fulfilment_row.business_id)
    ) then raise exception 'Shipment items do not belong to this seller and order.' using errcode = '23514'; end if;
    -- Serialize shipments which contain the same order line before checking the
    -- aggregate shipped quantity, so two parallel fulfillments cannot overship it.
    perform oi.id from public.order_items oi
    join public.fulfilment_items fi on fi.order_item_id = oi.id
    where fi.fulfilment_id = p_fulfilment_id
    order by oi.id
    for update of oi;
    if exists (
      select 1 from public.fulfilment_items fi join public.order_items oi on oi.id = fi.order_item_id
      where fi.fulfilment_id = p_fulfilment_id
        and (select sum(fi2.quantity_shipped) from public.fulfilment_items fi2
             join public.fulfilments f2 on f2.id = fi2.fulfilment_id
             where f2.order_id = fulfilment_row.order_id and fi2.order_item_id = fi.order_item_id
               and (f2.status in ('shipped','delivered') or f2.id = p_fulfilment_id)) > oi.quantity
    ) then raise exception 'Fulfilment quantities exceed the order quantity.' using errcode = '23514'; end if;
  end if;

  update public.fulfilments set
    status = p_next_status,
    carrier = case when p_next_status = 'shipped' then btrim(p_carrier) else carrier end,
    tracking_reference = case when p_next_status = 'shipped' then btrim(p_tracking_reference) else tracking_reference end,
    shipped_at = case when p_next_status = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when p_next_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    updated_at = now()
  where id = p_fulfilment_id;
  insert into public.fulfilment_events(fulfilment_id, actor_profile_id, previous_status, new_status)
  values (p_fulfilment_id, requester_id, fulfilment_row.status, p_next_status);
  return p_fulfilment_id;
end;
$function$;

revoke all on function public.save_my_address(uuid,text,text,text,text,text,text,text,text,text,text,double precision,double precision,boolean) from public, anon, authenticated;
revoke all on function public.set_my_cart_item(uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.remove_my_cart_item(uuid) from public, anon, authenticated;
revoke all on function public.set_seller_inventory(uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.advance_seller_fulfilment(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.save_my_address(uuid,text,text,text,text,text,text,text,text,text,text,double precision,double precision,boolean) to authenticated;
grant execute on function public.set_my_cart_item(uuid,uuid,integer,text) to authenticated;
grant execute on function public.remove_my_cart_item(uuid) to authenticated;
grant execute on function public.set_seller_inventory(uuid,uuid,integer,text) to authenticated;
grant execute on function public.advance_seller_fulfilment(uuid,text,text,text) to authenticated;

commit;
