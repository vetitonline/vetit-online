-- Vetit Phase 1 marketplace foundation.
-- Create the hosted Supabase project in Mumbai (ap-south-1) before applying.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.business_kind as enum ('seller', 'provider', 'seller_provider');
create type public.verification_status as enum (
  'pending', 'in_review', 'verified', 'rejected', 'suspended'
);
create type public.payment_routing_status as enum (
  'not_started', 'pending', 'verified', 'restricted', 'ineligible'
);
create type public.listing_kind as enum ('product', 'service');
create type public.listing_status as enum (
  'draft', 'submitted', 'published', 'rejected', 'archived'
);
create type public.order_status as enum (
  'pending_payment', 'paid', 'partially_fulfilled', 'fulfilled', 'cancelled', 'refunded'
);
create type public.booking_status as enum (
  'requested', 'accepted', 'awaiting_payment', 'confirmed', 'declined',
  'expired', 'cancelled', 'completed', 'refunded'
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.is_marketplace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create function public.business_is_publicly_approved(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    join public.seller_payment_routing routing on routing.business_id = b.id
    where b.id = target_business_id
      and b.verification_status = 'verified'
      and routing.status = 'verified'
  );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_format check (email is null or position('@' in email) > 1)
);

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email, phone on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.businesses (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  kind public.business_kind not null,
  display_name text not null,
  legal_name text,
  country_code char(2) not null default 'IN' check (country_code = 'IN'),
  verification_status public.verification_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_display_name_nonempty check (length(trim(display_name)) > 0)
);

create table public.seller_payment_routing (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider text not null default 'razorpay_route' check (provider = 'razorpay_route'),
  status public.payment_routing_status not null default 'not_started',
  provider_account_id text unique,
  onboarding_completed_at timestamptz,
  eligibility_confirmed_at timestamptz,
  live_payments_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint route_live_requires_approval check (
    not live_payments_enabled
    or (
      status = 'verified'
      and onboarding_completed_at is not null
      and eligibility_confirmed_at is not null
    )
  )
);

create table public.listings (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  kind public.listing_kind not null,
  category text not null,
  title text not null,
  description text not null default '',
  return_policy text,
  price_paise bigint check (price_paise is null or price_paise >= 0),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  country_code char(2) not null default 'IN' check (country_code = 'IN'),
  status public.listing_status not null default 'draft',
  service_area extensions.geography(Point, 4326),
  service_radius_m integer check (service_radius_m is null or service_radius_m > 0),
  moderation_notes text,
  moderated_by uuid references public.profiles(id),
  moderated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_title_nonempty check (length(trim(title)) > 0),
  constraint service_listings_need_location check (
    kind <> 'service' or service_area is not null
  )
);

create function public.enforce_listing_publication_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
     and not public.business_is_publicly_approved(new.business_id) then
    raise exception 'A verified business with verified payment routing is required to publish listings.';
  end if;
  return new;
end;
$$;

create trigger listings_require_approved_business
  before insert or update of status, business_id on public.listings
  for each row execute function public.enforce_listing_publication_requirements();

create index listings_public_search_idx
  on public.listings (kind, category, status, country_code);
create index listings_business_idx on public.listings (business_id, status);
create index listings_service_area_idx
  on public.listings using gist (service_area);

create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  currency char(3) not null default 'INR' check (currency = 'INR'),
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  platform_fee_paise bigint not null default 0 check (platform_fee_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  payment_provider text not null default 'razorpay_route',
  provider_order_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_matches check (total_paise = subtotal_paise + platform_fee_paise)
);

create table public.order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  seller_business_id uuid not null references public.businesses(id) on delete restrict,
  title_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  seller_amount_paise bigint not null check (seller_amount_paise >= 0),
  transfer_status public.payment_routing_status not null default 'pending',
  provider_transfer_id text,
  created_at timestamptz not null default now()
);

create index order_items_seller_idx on public.order_items (seller_business_id, order_id);

create table public.bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  provider_business_id uuid not null references public.businesses(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete set null,
  status public.booking_status not null default 'requested',
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  amount_paise bigint check (amount_paise is null or amount_paise >= 0),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  payment_provider text not null default 'razorpay_route',
  provider_payment_id text,
  payment_expires_at timestamptz,
  cancellation_requested_at timestamptz,
  cancellation_reason text,
  cancellation_window_hours integer check (
    cancellation_window_hours is null or cancellation_window_hours >= 0
  ),
  customer_cancellation_refund_percent integer check (
    customer_cancellation_refund_percent is null
    or customer_cancellation_refund_percent between 0 and 100
  ),
  provider_cancellation_refund_percent integer check (
    provider_cancellation_refund_percent is null
    or provider_cancellation_refund_percent between 0 and 100
  ),
  refund_amount_paise bigint not null default 0 check (refund_amount_paise >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order check (requested_end > requested_start)
);

create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_provider_idx
  on public.bookings (provider_business_id, requested_start, status);

create table public.payment_webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null default 'razorpay_route',
  provider_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger businesses_set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger seller_payment_routing_set_updated_at
  before update on public.seller_payment_routing
  for each row execute function public.set_updated_at();
create trigger listings_set_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.seller_payment_routing enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bookings enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Owners and public read businesses" on public.businesses
  for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.business_is_publicly_approved(businesses.id))
  );
create policy "Users create pending business applications" on public.businesses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and verification_status = 'pending'
    and verified_at is null
  );
create policy "Admins manage businesses" on public.businesses
  for all to authenticated
  using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create policy "Owners read payment routing status" on public.seller_payment_routing
  for select to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = seller_payment_routing.business_id
        and b.owner_id = (select auth.uid())
    )
  );
create policy "Admins manage payment routing" on public.seller_payment_routing
  for all to authenticated
  using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create policy "Read published or owned listings" on public.listings
  for select to anon, authenticated
  using (
    (
      status = 'published'
      and (select public.business_is_publicly_approved(listings.business_id))
    )
    or exists (
      select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid())
    )
  );
create policy "Owners create draft listings" on public.listings
  for insert to authenticated
  with check (
    status = 'draft'
    and exists (
      select 1 from public.businesses b
      where b.id = listings.business_id
        and b.owner_id = (select auth.uid())
        and b.verification_status = 'verified'
    )
  );
create policy "Owners edit unpublished listings" on public.listings
  for update to authenticated
  using (
    status in ('draft', 'rejected', 'archived')
    and exists (
      select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('draft', 'rejected', 'archived')
    and exists (
      select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid())
    )
  );
create policy "Admins moderate listings" on public.listings
  for all to authenticated
  using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create policy "Customers and relevant sellers read orders" on public.orders
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.order_items oi
      join public.businesses b on b.id = oi.seller_business_id
      where oi.order_id = orders.id and b.owner_id = (select auth.uid())
    )
    or (select public.is_marketplace_admin())
  );
create policy "Customers and relevant sellers read order items" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o where o.id = order_items.order_id
        and o.customer_id = (select auth.uid())
    )
    or exists (
      select 1 from public.businesses b
      where b.id = order_items.seller_business_id and b.owner_id = (select auth.uid())
    )
    or (select public.is_marketplace_admin())
  );

create policy "Customers and providers read bookings" on public.bookings
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.businesses b
      where b.id = bookings.provider_business_id and b.owner_id = (select auth.uid())
    )
    or (select public.is_marketplace_admin())
  );
create policy "Customers request bookings" on public.bookings
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'requested'
    and amount_paise is null
    and paid_at is null
    and provider_payment_id is null
  );

create policy "Admins read payment webhook events" on public.payment_webhook_events
  for select to authenticated
  using ((select public.is_marketplace_admin()));

-- No client-side write policies are provided for orders, order items,
-- booking state transitions, payment routing, or webhook events. These changes
-- must be performed by trusted server code after validating each workflow.
