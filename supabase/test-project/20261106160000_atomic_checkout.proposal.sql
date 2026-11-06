-- Additive, Test-only review proposal. Never part of the legacy db-push chain.
-- Requires canonical marketplace baseline and buyer/cart/inventory/fulfilment proposal.
-- Applying this SQL does NOT enable the application's hosted checkout gate.
begin;

do $$ begin
  if to_regclass('public.fulfilment_events') is null or to_regprocedure('public.advance_seller_fulfilment(uuid,text,text,text)') is null then
    raise exception 'Reviewed commerce prerequisites are required.';
  end if;
end $$;

-- Deferred integrity checks run after RPC security-definer scope has ended.
-- Verify complete snapshots as the trusted function owner, without widening table grants.
alter function public.assert_order_totals() security definer;
alter function public.assert_order_totals() set search_path = '';
revoke all on function public.assert_order_totals() from public, anon, authenticated, service_role;

create schema vetit_checkout;
revoke all on schema vetit_checkout from public, anon, authenticated, service_role;

create table vetit_checkout.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  request jsonb not null,
  items jsonb not null,
  delivery_minor bigint not null check (delivery_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  subtotal_minor bigint not null check (subtotal_minor > 0),
  total_minor bigint not null check (total_minor = subtotal_minor + delivery_minor + tax_minor and total_minor <= 9007199254740991),
  rate_reference text not null check (length(rate_reference) between 1 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create table vetit_checkout.checkouts (
  customer_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  quote_id uuid not null unique references vetit_checkout.quotes(id),
  order_id uuid not null unique references public.orders(id),
  primary key (customer_id, idempotency_key)
);
create table vetit_checkout.reservations (
  order_item_id uuid primary key references public.order_items(id),
  order_id uuid not null references public.orders(id),
  inventory_id uuid not null references public.inventory_levels(id),
  quantity integer not null check (quantity between 1 and 99),
  consumed integer not null default 0 check (consumed >= 0 and consumed <= quantity),
  released boolean not null default false,
  check (not released or consumed = 0)
);
create index checkout_reservations_order_idx on vetit_checkout.reservations(order_id, inventory_id);
create table vetit_checkout.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  actor_id uuid,
  previous_status text,
  new_status text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table vetit_checkout.quotes enable row level security;
alter table vetit_checkout.checkouts enable row level security;
alter table vetit_checkout.reservations enable row level security;
alter table vetit_checkout.order_events enable row level security;
revoke all on all tables in schema vetit_checkout from public, anon, authenticated, service_role;
revoke all on all sequences in schema vetit_checkout from public, anon, authenticated, service_role;

create function vetit_checkout.canonical_request(p_request jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare line jsonb; address jsonb; contact jsonb; canonical_lines jsonb; field text;
begin
  if jsonb_typeof(p_request) is distinct from 'object' or jsonb_typeof(p_request->'lines') is distinct from 'array'
     or jsonb_array_length(p_request->'lines') not between 1 and 50 then
    raise exception 'Invalid checkout lines.' using errcode = '22023';
  end if;
  for line in select value from jsonb_array_elements(p_request->'lines') loop
    if jsonb_typeof(line) is distinct from 'object'
       or coalesce(line->>'listingId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(line->>'productVariantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'A stock-tracked product variant and quantity 1-99 are required.' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_request->'lines') l
    group by (l->>'listingId')::uuid, (l->>'productVariantId')::uuid having sum((l->>'quantity')::integer) > 99) then
    raise exception 'Combined option quantity exceeds 99.' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('listingId',listing_id,'productVariantId',variant_id,'quantity',quantity) order by listing_id,variant_id)
    into canonical_lines from (
      select (l->>'listingId')::uuid listing_id, (l->>'productVariantId')::uuid variant_id, sum((l->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(p_request->'lines') l group by 1,2
    ) lines;
  address := p_request->'deliveryAddress'; contact := p_request->'customer';
  if jsonb_typeof(address) is distinct from 'object' or jsonb_typeof(contact) is distinct from 'object' then
    raise exception 'Customer and delivery details are required.' using errcode = '22023';
  end if;
  foreach field in array array['recipientName','phone','addressLine1','city','stateRegion','postalCode','countryCode'] loop
    if jsonb_typeof(address->field) is distinct from 'string' or length(btrim(address->>field)) = 0 then
      raise exception 'Required delivery field is missing.' using errcode = '22023';
    end if;
  end loop;
  if upper(btrim(address->>'countryCode')) <> 'IN' or btrim(address->>'postalCode') !~ '^[1-9][0-9]{5}$'
     or regexp_replace(address->>'phone', '[ ()-]', '', 'g') !~ '^(\+91)?[6-9][0-9]{9}$'
     or length(address->>'recipientName') > 120 or length(address->>'phone') > 32 or length(address->>'addressLine1') > 200
     or length(coalesce(address->>'addressLine2','')) > 200 or length(coalesce(address->>'locality','')) > 120
     or length(address->>'city') > 120 or length(address->>'stateRegion') > 120
     or jsonb_typeof(contact->'email') is distinct from 'string' or length(contact->>'email') > 254
     or btrim(contact->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or exists (select 1 from jsonb_each_text(address) a where a.value ~ '[[:cntrl:]]') then
    raise exception 'Delivery or contact details are invalid.' using errcode = '22023';
  end if;
  return jsonb_build_object('lines',canonical_lines,
    'customer',jsonb_build_object('name',btrim(address->>'recipientName'),'email',lower(btrim(contact->>'email'))),
    'deliveryAddress',jsonb_build_object('recipientName',btrim(address->>'recipientName'),'phone',btrim(address->>'phone'),
      'addressLine1',btrim(address->>'addressLine1'),'addressLine2',nullif(btrim(address->>'addressLine2'),''),
      'locality',nullif(btrim(address->>'locality'),''),'city',btrim(address->>'city'),'stateRegion',btrim(address->>'stateRegion'),
      'postalCode',btrim(address->>'postalCode'),'countryCode','IN'));
end $$;

-- All price writes serialize on the parent listing, including new future versions.
-- Checkout holds SHARE locks; this closes the new-price insertion phantom window.
create function vetit_checkout.lock_price_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.listing_id is distinct from old.listing_id then
    raise exception 'Price parent is immutable.' using errcode = '22023';
  end if;
  perform 1 from public.listings where id = case when tg_op = 'DELETE' then old.listing_id else new.listing_id end for update;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger checkout_price_parent_lock before insert or update or delete on public.listing_prices
  for each row execute function vetit_checkout.lock_price_parent();

create function vetit_checkout.resolve_items(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare line jsonb; listing public.listings%rowtype; variant public.product_variants%rowtype;
  price public.listing_prices%rowtype; target_business uuid; result jsonb := '[]'; at_time timestamptz := clock_timestamp();
begin
  perform 1 from public.markets where country_code = 'IN' and market_status = 'active' and currency_code = 'INR' for share;
  if not found then raise exception 'Market unavailable.' using errcode = '22023'; end if;
  for line in select value from jsonb_array_elements(p_request->'lines') loop
    select l.business_id into target_business from public.listings l where l.id = (line->>'listingId')::uuid;
    perform 1 from public.businesses b where b.id = target_business and b.is_active and b.archived_at is null and b.verification_status = 'verified' for share;
    if not found then raise exception 'Seller unavailable.' using errcode = '22023'; end if;
    select l.* into listing from public.listings l where l.id = (line->>'listingId')::uuid and l.business_id = target_business
      and l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null for share;
    if not found then raise exception 'Product unavailable.' using errcode = '22023'; end if;
    perform 1 from public.categories c where c.id = listing.category_id and c.kind in ('product','both') and c.moderation_status = 'active' for share;
    if not found then raise exception 'Category unavailable.' using errcode = '22023'; end if;
    perform 1 from public.listing_markets m where m.listing_id = listing.id and m.market_code = 'IN' and m.availability_status = 'available' and m.compliance_status = 'approved' for share;
    if not found then raise exception 'Product market unavailable.' using errcode = '22023'; end if;
    select v.* into variant from public.product_variants v where v.id = (line->>'productVariantId')::uuid and v.listing_id = listing.id and v.active_status for share;
    if not found then raise exception 'Product option unavailable.' using errcode = '22023'; end if;
    select p.* into price from public.listing_prices p where p.listing_id = listing.id and p.product_variant_id = variant.id
      and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active'
      and p.valid_from <= at_time and (p.valid_to is null or p.valid_to > at_time)
      order by p.valid_from desc, p.id limit 1 for share;
    if not found or price.amount_minor <= 0 then raise exception 'Current price unavailable.' using errcode = '22023'; end if;
    result := result || jsonb_build_array(jsonb_build_object('listingId',listing.id,'productVariantId',variant.id,
      'businessId',listing.business_id,'quantity',(line->>'quantity')::integer,'unitPriceMinor',price.amount_minor,
      'title',listing.title,'sellerSku',variant.seller_sku,'optionAttributes',variant.option_attributes));
  end loop;
  return result;
end $$;

create function vetit_checkout.order_summary(p_order public.orders)
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('id',p_order.id,'customer_profile_id',p_order.customer_profile_id,'market_code',p_order.market_code,
    'order_status',p_order.order_status,'currency_code',p_order.currency_code,'subtotal_minor',p_order.subtotal_minor,
    'delivery_minor',p_order.delivery_minor,'tax_minor',p_order.tax_minor,'total_minor',p_order.total_minor,'created_at',p_order.created_at);
$$;

-- Trusted server worker ONLY. Delivery/tax are authoritative adapter results, not client input.
create function public.issue_checkout_quote(p_customer_id uuid, p_request jsonb, p_delivery_minor bigint, p_tax_minor bigint, p_rate_reference text, p_ttl_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request jsonb; items jsonb; subtotal numeric; quote vetit_checkout.quotes%rowtype;
begin
  if p_customer_id is null or not exists (select 1 from public.profiles where id = p_customer_id)
     or p_delivery_minor is null or p_delivery_minor < 0 or p_tax_minor is null or p_tax_minor < 0
     or p_ttl_seconds is null or p_ttl_seconds not between 30 and 900
     or p_rate_reference is null or length(p_rate_reference) not between 1 and 200 then
    raise exception 'Invalid trusted quote request.' using errcode = '22023';
  end if;
  request := vetit_checkout.canonical_request(p_request);
  items := vetit_checkout.resolve_items(request);
  select sum((i->>'quantity')::numeric * (i->>'unitPriceMinor')::numeric) into subtotal from jsonb_array_elements(items) i;
  if subtotal + p_delivery_minor + p_tax_minor > 9007199254740991 then raise exception 'Quote amount out of range.' using errcode = '22023'; end if;
  insert into vetit_checkout.quotes(customer_id,request,items,delivery_minor,tax_minor,subtotal_minor,total_minor,rate_reference,expires_at)
  values(p_customer_id,request,items,p_delivery_minor,p_tax_minor,subtotal,subtotal+p_delivery_minor+p_tax_minor,p_rate_reference,clock_timestamp()+make_interval(secs=>p_ttl_seconds)) returning * into quote;
  return jsonb_build_object('id',quote.id,'subtotalMinor',quote.subtotal_minor,'deliveryMinor',quote.delivery_minor,'taxMinor',quote.tax_minor,
    'totalMinor',quote.total_minor,'currencyCode','INR','expiresAt',quote.expires_at);
end $$;

-- Successful replays reconcile before checking expiry, current prices or stock.
create function public.get_my_checkout_order(p_quote_id uuid, p_idempotency_key uuid, p_expected_total bigint, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); saved vetit_checkout.checkouts%rowtype; quote vetit_checkout.quotes%rowtype; result public.orders%rowtype;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into saved from vetit_checkout.checkouts where customer_id = actor and idempotency_key = p_idempotency_key;
  if not found then return null; end if;
  select * into quote from vetit_checkout.quotes where id = saved.quote_id and customer_id = actor;
  if saved.quote_id is distinct from p_quote_id or quote.total_minor is distinct from p_expected_total
     or quote.request is distinct from vetit_checkout.canonical_request(p_request) then
    raise exception 'Checkout reference conflicts with this request.' using errcode = '22023';
  end if;
  select * into result from public.orders where id = saved.order_id and customer_profile_id = actor;
  return vetit_checkout.order_summary(result);
end $$;

create function public.place_my_order(p_quote_id uuid, p_idempotency_key uuid, p_expected_total bigint, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); quote vetit_checkout.quotes%rowtype; replay jsonb; current_items jsonb; item jsonb;
  inventory public.inventory_levels%rowtype; result public.orders%rowtype; order_item_id uuid; fulfilment_id uuid; seller uuid;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_quote_id is null or p_idempotency_key is null or p_expected_total is null then raise exception 'Checkout references required.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_idempotency_key::text,0));
  replay := public.get_my_checkout_order(p_quote_id,p_idempotency_key,p_expected_total,p_request);
  if replay is not null then return replay; end if;
  select * into quote from vetit_checkout.quotes where id = p_quote_id and customer_id = actor for update;
  if not found then raise exception 'Checkout quote not found.' using errcode = '42501'; end if;
  if exists(select 1 from vetit_checkout.checkouts where quote_id = quote.id) then raise exception 'Quote already used.' using errcode = '22023'; end if;
  if quote.total_minor <> p_expected_total or quote.request is distinct from vetit_checkout.canonical_request(p_request) then
    raise exception 'Checkout details or total changed.' using errcode = '22023';
  end if;
  current_items := vetit_checkout.resolve_items(quote.request);
  if current_items is distinct from quote.items then raise exception 'Product price, seller or snapshot changed. Review checkout again.' using errcode = '22023'; end if;
  -- Global inventory-ID order avoids opposite-cart lock ordering deadlocks.
  perform i.id from public.inventory_levels i where i.stock_location is null
    and i.product_variant_id in (select (v->>'productVariantId')::uuid from jsonb_array_elements(current_items) v)
    order by i.id for update;
  -- A scheduled price can expire/become effective while inventory is contended.
  -- Resolve again at one fresh pricing instant after all inventory locks are held.
  current_items := vetit_checkout.resolve_items(quote.request);
  if current_items is distinct from quote.items then raise exception 'Current product price changed while waiting for inventory.' using errcode = '22023'; end if;
  if quote.expires_at <= clock_timestamp() then raise exception 'Checkout quote expired.' using errcode = '22023'; end if;
  insert into public.orders(customer_profile_id,market_code,order_status,currency_code,subtotal_minor,delivery_minor,tax_minor,total_minor,delivery_address_snapshot)
  values(actor,'IN','pending','INR',quote.subtotal_minor,quote.delivery_minor,quote.tax_minor,quote.total_minor,quote.request->'deliveryAddress') returning * into result;
  insert into vetit_checkout.checkouts values(actor,p_idempotency_key,quote.id,result.id);
  for seller in select distinct (v->>'businessId')::uuid from jsonb_array_elements(current_items) v order by 1 loop
    insert into public.fulfilments(order_id,business_id) values(result.id,seller) returning id into fulfilment_id;
    for item in select value from jsonb_array_elements(current_items) where (value->>'businessId')::uuid = seller loop
      select * into inventory from public.inventory_levels where product_variant_id = (item->>'productVariantId')::uuid
        and business_id = seller and stock_location is null;
      if not found or inventory.quantity_on_hand - inventory.quantity_reserved < (item->>'quantity')::integer then
        raise exception 'Insufficient inventory for this product option.' using errcode = '23514';
      end if;
      insert into public.order_items(order_id,listing_id,business_id,product_variant_id,title_snapshot,seller_sku_snapshot,quantity,unit_price_minor,currency_code)
      values(result.id,(item->>'listingId')::uuid,seller,(item->>'productVariantId')::uuid,item->>'title',item->>'sellerSku',(item->>'quantity')::integer,(item->>'unitPriceMinor')::bigint,'INR') returning id into order_item_id;
      insert into public.fulfilment_items(fulfilment_id,order_item_id,quantity_shipped) values(fulfilment_id,order_item_id,(item->>'quantity')::integer);
      update public.inventory_levels set quantity_reserved = quantity_reserved + (item->>'quantity')::integer, updated_at = clock_timestamp() where id = inventory.id;
      insert into vetit_checkout.reservations(order_item_id,order_id,inventory_id,quantity) values(order_item_id,result.id,inventory.id,(item->>'quantity')::integer);
    end loop;
  end loop;
  insert into vetit_checkout.order_events(order_id,actor_id,new_status) values(result.id,actor,'pending');
  return vetit_checkout.order_summary(result);
end $$;

create function vetit_checkout.guard_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from vetit_checkout.checkouts where order_id = old.id) then return new; end if;
  if (to_jsonb(new) - 'order_status' - 'updated_at') is distinct from (to_jsonb(old) - 'order_status' - 'updated_at') then
    raise exception 'Checkout order snapshots are immutable.' using errcode = '42501';
  end if;
  if new.order_status = old.order_status then return new; end if;
  if old.order_status = 'pending' and new.order_status = 'cancelled' then
    if exists(select 1 from public.payments where order_id = old.id and status in ('authorized','captured')) then
      raise exception 'Payment reconciliation required before cancellation.' using errcode = '42501';
    end if;
  elsif old.order_status = 'pending' and new.order_status = 'confirmed' then
    if not exists(select 1 from public.payments where order_id = old.id and customer_profile_id = old.customer_profile_id
      and status = 'captured' and amount_minor = old.total_minor and currency_code = old.currency_code) then
      raise exception 'Verified captured payment required.' using errcode = '42501';
    end if;
  elsif old.order_status = 'confirmed' and new.order_status = 'processing' then null;
  elsif old.order_status in ('confirmed','processing') and new.order_status = 'fulfilled' then
    if not exists(select 1 from public.fulfilments where order_id = old.id)
       or exists(select 1 from public.fulfilments where order_id = old.id and status <> 'delivered')
       or exists(select 1 from vetit_checkout.reservations where order_id = old.id and (released or consumed <> quantity)) then
      raise exception 'All reserved items must be shipped and delivered.' using errcode = '23514';
    end if;
  else raise exception 'Order status transition denied.' using errcode = '42501'; end if;
  return new;
end $$;
create trigger checkout_order_guard before update on public.orders for each row execute function vetit_checkout.guard_order_status();

create function vetit_checkout.guard_order_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from vetit_checkout.checkouts where order_id = old.order_id)
     or (tg_op = 'UPDATE' and exists(select 1 from vetit_checkout.checkouts where order_id = new.order_id)) then
    raise exception 'Checkout order-line snapshots are immutable.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger checkout_order_item_guard before update or delete on public.order_items for each row execute function vetit_checkout.guard_order_item();

create function vetit_checkout.order_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reservation vetit_checkout.reservations%rowtype;
begin
  if new.order_status = old.order_status or not exists(select 1 from vetit_checkout.checkouts where order_id = new.id) then return null; end if;
  if new.order_status = 'cancelled' then
    for reservation in select * from vetit_checkout.reservations where order_id = new.id and not released order by inventory_id for update loop
      if reservation.consumed <> 0 then raise exception 'Shipped stock cannot be released by cancellation.' using errcode = '23514'; end if;
      update public.inventory_levels set quantity_reserved = quantity_reserved - reservation.quantity, updated_at = clock_timestamp() where id = reservation.inventory_id;
      update vetit_checkout.reservations set released = true where order_item_id = reservation.order_item_id;
    end loop;
    update public.fulfilments set status = 'cancelled', updated_at = clock_timestamp() where order_id = new.id;
  end if;
  insert into vetit_checkout.order_events(order_id,actor_id,previous_status,new_status) values(new.id,auth.uid(),old.order_status,new.order_status);
  return null;
end $$;
create trigger checkout_order_event after update on public.orders for each row execute function vetit_checkout.order_status_event();

create function vetit_checkout.manage_shipment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare status text; line record; inventory public.inventory_levels%rowtype;
begin
  if new.status = old.status or not exists(select 1 from vetit_checkout.checkouts where order_id = new.order_id) then return new; end if;
  select order_status into status from public.orders where id = new.order_id for update;
  if new.status = 'cancelled' then
    if status <> 'cancelled' then raise exception 'Cancel the pending checkout order atomically, not an individual shipment.' using errcode = '42501'; end if;
    return new;
  end if;
  if not ((old.status = 'pending' and new.status = 'packed') or (old.status = 'packed' and new.status = 'shipped') or (old.status = 'shipped' and new.status = 'delivered'))
     or status not in ('confirmed','processing') then raise exception 'Paid order and valid shipment transition required.' using errcode = '42501'; end if;
  if new.status in ('packed','shipped') and not exists(select 1 from public.payments p join public.orders o on o.id = p.order_id
    where o.id = new.order_id and p.customer_profile_id = o.customer_profile_id and p.status = 'captured'
      and p.amount_minor = o.total_minor and p.currency_code = o.currency_code) then
    raise exception 'Captured payment proof required before dispatch.' using errcode = '42501';
  end if;
  if new.status = 'shipped' then
    if not exists(select 1 from public.fulfilment_items where fulfilment_id = new.id)
       or exists(select 1 from public.fulfilment_items f left join vetit_checkout.reservations r on r.order_item_id = f.order_item_id
         join public.order_items oi on oi.id = f.order_item_id
         where f.fulfilment_id = new.id and (r.order_item_id is null or r.order_id <> new.order_id or oi.business_id <> new.business_id)) then
      raise exception 'Shipment items require matching checkout reservations.' using errcode = '23514';
    end if;
    for line in select r.*, f.quantity_shipped from public.fulfilment_items f join vetit_checkout.reservations r on r.order_item_id = f.order_item_id
      where f.fulfilment_id = new.id order by r.inventory_id for update of r loop
      if line.released or line.consumed + line.quantity_shipped > line.quantity then raise exception 'Reservation cannot cover shipment.' using errcode = '23514'; end if;
      select * into inventory from public.inventory_levels where id = line.inventory_id for update;
      update public.inventory_levels set quantity_reserved = quantity_reserved - line.quantity_shipped,
        quantity_on_hand = quantity_on_hand - line.quantity_shipped, updated_at = clock_timestamp() where id = inventory.id;
      update vetit_checkout.reservations set consumed = consumed + line.quantity_shipped where order_item_id = line.order_item_id;
      insert into public.inventory_movements(inventory_level_id,product_variant_id,actor_profile_id,related_order_item_id,quantity_change,reason)
        values(inventory.id,inventory.product_variant_id,auth.uid(),line.order_item_id,-line.quantity_shipped,'checkout_shipped');
    end loop;
  end if;
  return new;
end $$;
create trigger checkout_shipment_guard before update on public.fulfilments for each row execute function vetit_checkout.manage_shipment();

create function public.cancel_my_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select o.* into result from public.orders o join vetit_checkout.checkouts c on c.order_id = o.id
    where o.id = p_order_id and o.customer_profile_id = auth.uid() for update of o;
  if not found then raise exception 'Order not found.' using errcode = '42501'; end if;
  if result.order_status = 'cancelled' then return vetit_checkout.order_summary(result); end if;
  if result.order_status <> 'pending' then raise exception 'Only an unpaid pending order may be cancelled.' using errcode = '42501'; end if;
  update public.orders set order_status = 'cancelled', updated_at = clock_timestamp() where id = result.id returning * into result;
  return vetit_checkout.order_summary(result);
end $$;

-- Service worker functions require independently persisted captured payment proof.
create function public.confirm_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.orders%rowtype;
begin
  select o.* into result from public.orders o join vetit_checkout.checkouts c on c.order_id = o.id where o.id = p_order_id for update of o;
  if not found then raise exception 'Checkout order not found.' using errcode = '22023'; end if;
  if result.order_status in ('confirmed','processing','fulfilled') then
    if not exists(select 1 from public.payments where order_id = result.id and customer_profile_id = result.customer_profile_id
      and status = 'captured' and amount_minor = result.total_minor and currency_code = result.currency_code) then
      raise exception 'Verified captured payment required.' using errcode = '42501';
    end if;
    return vetit_checkout.order_summary(result);
  end if;
  if result.order_status <> 'pending' then raise exception 'Order is not pending.' using errcode = '22023'; end if;
  update public.orders set order_status = 'confirmed', updated_at = clock_timestamp() where id = result.id returning * into result;
  return vetit_checkout.order_summary(result);
end $$;
create function public.complete_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.orders%rowtype;
begin
  select o.* into result from public.orders o join vetit_checkout.checkouts c on c.order_id = o.id where o.id = p_order_id for update of o;
  if not found then raise exception 'Checkout order not found.' using errcode = '22023'; end if;
  update public.orders set order_status = 'fulfilled', updated_at = clock_timestamp() where id = result.id returning * into result;
  return vetit_checkout.order_summary(result);
end $$;

-- Lock order before the legacy RPC takes SHARE locks: serialize shipments safely.
create function public.advance_checkout_fulfilment(p_fulfilment_id uuid,p_next_status text,p_carrier text default null,p_tracking_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_order uuid;
begin
  select f.order_id into target_order from public.fulfilments f join public.businesses b on b.id = f.business_id
    join public.business_memberships m on m.business_id = b.id where f.id = p_fulfilment_id and b.is_active and b.archived_at is null
    and m.profile_id = auth.uid() and m.membership_status = 'active' and m.member_role in ('owner','admin','fulfillment_manager');
  if not found then raise exception 'Fulfilment access denied.' using errcode = '42501'; end if;
  perform 1 from public.orders where id = target_order for update;
  return public.advance_seller_fulfilment(p_fulfilment_id,p_next_status,p_carrier,p_tracking_reference);
end $$;

revoke all on all functions in schema vetit_checkout from public, anon, authenticated, service_role;
revoke all on function public.issue_checkout_quote(uuid,jsonb,bigint,bigint,text,integer) from public, anon, authenticated;
revoke all on function public.get_my_checkout_order(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.place_my_order(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.cancel_my_checkout_order(uuid) from public, anon, authenticated;
revoke all on function public.confirm_checkout_order(uuid) from public, anon, authenticated;
revoke all on function public.complete_checkout_order(uuid) from public, anon, authenticated;
revoke all on function public.advance_checkout_fulfilment(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.issue_checkout_quote(uuid,jsonb,bigint,bigint,text,integer) to service_role;
grant execute on function public.get_my_checkout_order(uuid,uuid,bigint,jsonb), public.place_my_order(uuid,uuid,bigint,jsonb), public.cancel_my_checkout_order(uuid), public.advance_checkout_fulfilment(uuid,text,text,text) to authenticated;
grant execute on function public.confirm_checkout_order(uuid), public.complete_checkout_order(uuid) to service_role;
commit;
