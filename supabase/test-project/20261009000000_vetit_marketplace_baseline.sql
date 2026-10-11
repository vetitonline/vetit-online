-- TEST PROJECT ONLY: schema-only baseline for Vetit's current marketplace API.
-- This is intentionally outside supabase/migrations so it cannot enter the
-- existing production migration chain. It contains no product/customer data.
-- Apply only to the dedicated Vetit Online Test project after explicit approval.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','seller','provider','admin')),
  created_at timestamptz default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  legal_name text,
  business_type text not null default 'individual' check (business_type in ('individual','company','farm','other')),
  public_email text,
  public_phone text,
  website_url text,
  country_code char(2) not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','suspended')),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','admin','catalog_manager','fulfillment_manager')),
  membership_status text not null default 'active' check (membership_status in ('active','invited','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, profile_id)
);
create index business_memberships_profile_status_idx on public.business_memberships(profile_id, membership_status, business_id);

create table public.business_verification_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  verification_type text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  private_document_reference text,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index business_verification_records_business_idx on public.business_verification_records(business_id, created_at desc);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null default 'product' check (kind in ('product','service','both')),
  moderation_status text not null default 'active' check (moderation_status in ('draft','pending','active','archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_parent_sort_idx on public.categories(parent_id, sort_order, name);
create index categories_kind_status_sort_idx on public.categories(kind, moderation_status, sort_order);

create table public.animal_species (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.animal_species(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index animal_species_active_name_idx on public.animal_species(is_active, display_name);

create table public.category_species (
  category_id uuid not null references public.categories(id) on delete cascade,
  species_id uuid not null references public.animal_species(id) on delete cascade,
  primary key (category_id, species_id)
);
create index category_species_species_idx on public.category_species(species_id, category_id);

create table public.markets (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  market_status text not null default 'inactive' check (market_status in ('active','inactive','maintenance')),
  locale text,
  timezone text,
  tax_configuration_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  kind text not null check (kind in ('product','service')),
  title text not null check (length(trim(title)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  moderation_status text not null default 'draft' check (moderation_status in ('draft','submitted','published','rejected')),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_business_status_updated_idx on public.listings(business_id, moderation_status, updated_at desc) where archived_at is null;
create index listings_kind_status_created_idx on public.listings(kind, moderation_status, created_at desc) where archived_at is null;
create index listings_category_kind_status_idx on public.listings(category_id, kind, moderation_status) where archived_at is null;

create table public.listing_markets (
  listing_id uuid not null references public.listings(id) on delete cascade,
  market_code char(2) not null references public.markets(country_code) on update cascade on delete restrict,
  availability_status text not null default 'unavailable' check (availability_status in ('available','unavailable')),
  compliance_status text not null default 'pending' check (compliance_status in ('pending','approved','rejected')),
  primary key (listing_id, market_code)
);
create index listing_markets_public_lookup_idx on public.listing_markets(market_code, availability_status, compliance_status, listing_id);

create table public.listing_species (
  listing_id uuid not null references public.listings(id) on delete cascade,
  species_id uuid not null references public.animal_species(id) on delete restrict,
  primary key (listing_id, species_id)
);
create index listing_species_species_listing_idx on public.listing_species(species_id, listing_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_sku text not null check (seller_sku ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'),
  barcode text,
  option_attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(option_attributes) = 'object'),
  active_status boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, id),
  unique (listing_id, seller_sku)
);
create index product_variants_listing_active_idx on public.product_variants(listing_id, active_status, created_at);

create table public.listing_prices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  market_code char(2) not null references public.markets(country_code) on update cascade on delete restrict,
  product_variant_id uuid,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'active' check (status in ('active','inactive','scheduled')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint listing_prices_validity check (valid_to is null or valid_to > valid_from),
  constraint listing_prices_variant_listing_fk foreign key (listing_id, product_variant_id)
    references public.product_variants(listing_id, id) on delete cascade
);
create unique index listing_prices_base_version_uq on public.listing_prices(listing_id, market_code, valid_from)
  where product_variant_id is null;
create unique index listing_prices_variant_version_uq on public.listing_prices(listing_id, market_code, product_variant_id, valid_from)
  where product_variant_id is not null;
create index listing_prices_effective_lookup_idx on public.listing_prices(listing_id, market_code, currency_code, status, valid_from desc, valid_to);
create index listing_prices_variant_lookup_idx on public.listing_prices(product_variant_id, market_code, status, valid_from desc) where product_variant_id is not null;

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_object_path text not null unique,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  visibility_status text not null default 'visible' check (visibility_status in ('visible','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, sort_order)
);
create index listing_images_listing_visibility_order_idx on public.listing_images(listing_id, visibility_status, sort_order);

create table public.provider_profiles (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider_type text not null check (provider_type in ('veterinary_clinic','veterinarian','groomer','daycare','boarding','trainer','walker','pet_sitter','transport','livestock_provider','other')),
  biography text,
  contact_email text,
  contact_phone text,
  credential_verification_status text not null default 'pending' check (credential_verification_status in ('not_required','pending','verified','rejected')),
  published_status text not null default 'draft' check (published_status in ('draft','published','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  address_line1 text,
  address_line2 text,
  locality text,
  city text,
  state_region text,
  postal_code text,
  country_code char(2) not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  timezone text,
  is_public boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create index provider_locations_business_active_idx on public.provider_locations(business_id, is_active, is_public);
create index provider_locations_city_idx on public.provider_locations(lower(city), lower(locality));

create table public.service_offerings (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  provider_location_id uuid references public.provider_locations(id) on delete set null,
  delivery_mode text not null default 'at_provider' check (delivery_mode in ('at_provider','mobile','remote','farm_visit')),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  appointment_required boolean not null default false,
  cancellation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_offerings_location_idx on public.service_offerings(provider_location_id);

create table public.service_availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_listing_id uuid not null references public.service_offerings(listing_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_local_time time not null,
  end_local_time time not null check (end_local_time > start_local_time),
  timezone text not null default 'Asia/Kolkata',
  active_status boolean not null default true,
  effective_from date,
  effective_to date,
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  unique (service_listing_id, weekday, start_local_time)
);
create index service_availability_rules_public_idx on public.service_availability_rules(service_listing_id, weekday) where active_status;

create table public.service_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  service_listing_id uuid not null references public.service_offerings(listing_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  is_unavailable boolean not null default true,
  reason text,
  created_at timestamptz not null default now()
);
create index service_availability_exceptions_listing_time_idx on public.service_availability_exceptions(service_listing_id, starts_at, ends_at);

create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  service_listing_id uuid not null references public.service_offerings(listing_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'available' check (status in ('available','held','booked','cancelled')),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (service_listing_id, starts_at)
);
create index appointment_slots_available_idx on public.appointment_slots(service_listing_id, starts_at) where status = 'available';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider_business_id uuid not null references public.businesses(id) on delete restrict,
  provider_location_id uuid references public.provider_locations(id) on delete set null,
  service_listing_id uuid not null references public.service_offerings(listing_id) on delete restrict,
  appointment_slot_id uuid references public.appointment_slots(id) on delete set null,
  requested_start timestamptz not null,
  requested_end timestamptz not null check (requested_end > requested_start),
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed','rejected')),
  price_minor bigint not null check (price_minor >= 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  cancellation_policy_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_customer_created_idx on public.bookings(customer_profile_id, created_at desc);
create index bookings_provider_status_start_idx on public.bookings(provider_business_id, status, requested_start);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  address_line1 text,
  address_line2 text,
  label text,
  recipient_name text not null,
  phone text,
  city text not null,
  locality text,
  state_region text,
  postal_code text,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_profile_default_idx on public.addresses(profile_id, is_default);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  market_code char(2) not null references public.markets(country_code) on update cascade on delete restrict,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','converted','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index carts_one_active_per_profile_market_idx on public.carts(profile_id, market_code) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete restrict,
  product_variant_id uuid,
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_variant_listing_fk foreign key (listing_id, product_variant_id)
    references public.product_variants(listing_id, id) on delete restrict,
  unique (cart_id, listing_id, product_variant_id)
);
create index cart_items_cart_idx on public.cart_items(cart_id, created_at);

create table public.favourites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);
create index favourites_listing_idx on public.favourites(listing_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  market_code char(2) not null references public.markets(country_code) on update cascade on delete restrict,
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','fulfilled','cancelled','refunded')),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  delivery_minor bigint not null default 0 check (delivery_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  delivery_address_snapshot jsonb check (delivery_address_snapshot is null or jsonb_typeof(delivery_address_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_created_idx on public.orders(customer_profile_id, created_at desc);
create index orders_market_status_created_idx on public.orders(market_code, order_status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  product_variant_id uuid,
  title_snapshot text not null,
  seller_sku_snapshot text,
  quantity integer not null check (quantity between 1 and 999),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  constraint order_items_variant_listing_fk foreign key (listing_id, product_variant_id)
    references public.product_variants(listing_id, id) on delete restrict
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_business_idx on public.order_items(business_id, created_at desc);

create table public.fulfilments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','packed','shipped','delivered','cancelled')),
  carrier text,
  tracking_reference text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fulfilments_order_business_idx on public.fulfilments(order_id, business_id, status);

create table public.fulfilment_items (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null references public.fulfilments(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity_shipped integer not null check (quantity_shipped > 0),
  created_at timestamptz not null default now(),
  unique (fulfilment_id, order_item_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  provider_payment_reference text,
  status text not null default 'pending' check (status in ('pending','authorized','captured','failed','refunded','cancelled')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or booking_id is not null)
);
create index payments_customer_created_idx on public.payments(customer_profile_id, created_at desc);
create index payments_order_idx on public.payments(order_id) where order_id is not null;
create index payments_booking_idx on public.payments(booking_id) where booking_id is not null;

create table public.seller_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  payment_provider text not null,
  provider_account_reference text,
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started','pending','verified','rejected','suspended')),
  live_payments_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, payment_provider),
  check (not live_payments_enabled or onboarding_status = 'verified')
);

create table public.inventory_levels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  stock_location text,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand),
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  -- NULL means the default stock location and must still be unique.
  unique nulls not distinct (business_id, product_variant_id, stock_location)
);
create index inventory_levels_business_stock_idx on public.inventory_levels(business_id, quantity_on_hand);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_level_id uuid references public.inventory_levels(id) on delete set null,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  related_order_item_id uuid references public.order_items(id) on delete set null,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_created_idx on public.inventory_movements(product_variant_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  review_text text,
  verified_purchase boolean not null default false,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','published','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_listing_status_created_idx on public.reviews(listing_id, moderation_status, created_at desc);

-- Every public-facing table is protected by RLS; direct catalogue writes are
-- intentionally withheld and later granted only to the seller RPC/image flow.
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_verification_records enable row level security;
alter table public.categories enable row level security;
alter table public.animal_species enable row level security;
alter table public.category_species enable row level security;
alter table public.markets enable row level security;
alter table public.listings enable row level security;
alter table public.listing_markets enable row level security;
alter table public.listing_species enable row level security;
alter table public.product_variants enable row level security;
alter table public.listing_prices enable row level security;
alter table public.listing_images enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_locations enable row level security;
alter table public.service_offerings enable row level security;
alter table public.service_availability_rules enable row level security;
alter table public.service_availability_exceptions enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.addresses enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.favourites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.fulfilments enable row level security;
alter table public.fulfilment_items enable row level security;
alter table public.payments enable row level security;
alter table public.seller_payment_accounts enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.reviews enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy businesses_read_public_or_member on public.businesses for select to anon, authenticated using (
  (verification_status = 'verified' and is_active and archived_at is null)
  or exists (select 1 from public.business_memberships m where m.business_id = id and m.profile_id = (select auth.uid()) and m.membership_status = 'active')
);
create policy businesses_update_owner_or_admin on public.businesses for update to authenticated using (
  exists (select 1 from public.business_memberships m where m.business_id = id and m.profile_id = (select auth.uid()) and m.member_role in ('owner','admin') and m.membership_status = 'active')
) with check (
  exists (select 1 from public.business_memberships m where m.business_id = id and m.profile_id = (select auth.uid()) and m.member_role in ('owner','admin') and m.membership_status = 'active')
);
create policy memberships_read_self on public.business_memberships for select to authenticated using (profile_id = (select auth.uid()));
create policy business_verification_admin_read on public.business_verification_records for select to authenticated using (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false));

-- Membership checks from policies that cross listings/listing_markets must not
-- recursively re-enter RLS. This narrowly scoped helper reads only membership
-- facts and derives its identity from the caller's JWT.
create or replace function public.is_listing_business_member(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = p_listing_id and bm.profile_id = (select auth.uid())
      and bm.membership_status = 'active'
  );
$$;
revoke all on function public.is_listing_business_member(uuid) from public, anon, authenticated;
grant execute on function public.is_listing_business_member(uuid) to authenticated;

create policy categories_read_active on public.categories for select to anon, authenticated using (moderation_status = 'active');
create policy categories_admin_manage on public.categories for all to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false))
  with check (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false));
create policy species_read_active on public.animal_species for select to anon, authenticated using (is_active);
create policy species_admin_manage on public.animal_species for all to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false))
  with check (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false));
create policy category_species_read_active on public.category_species for select to anon, authenticated using (
  exists (select 1 from public.categories c where c.id = category_id and c.moderation_status = 'active')
  and exists (select 1 from public.animal_species s where s.id = species_id and s.is_active)
);
create policy category_species_admin_manage on public.category_species for all to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false))
  with check (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false));
create policy markets_read_active on public.markets for select to anon, authenticated using (market_status = 'active');
create policy markets_admin_manage on public.markets for all to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false))
  with check (coalesce((select auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false));

create policy listings_read_published_or_member on public.listings for select to anon, authenticated using (
  (moderation_status = 'published' and archived_at is null
   and exists (select 1 from public.businesses b where b.id = listings.business_id and b.verification_status = 'verified' and b.is_active and b.archived_at is null)
   and exists (select 1 from public.listing_markets lm join public.markets m on m.country_code = lm.market_code
     where lm.listing_id = listings.id and lm.availability_status = 'available' and lm.compliance_status = 'approved' and m.market_status = 'active'))
  or exists (select 1 from public.business_memberships bm where bm.business_id = listings.business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy listing_markets_read_available on public.listing_markets for select to anon, authenticated using (
  availability_status = 'available' and compliance_status = 'approved'
  and exists (select 1 from public.markets m where m.country_code = market_code and m.market_status = 'active')
);
create policy listing_markets_read_member on public.listing_markets for select to authenticated using (
  (select public.is_listing_business_member(listing_markets.listing_id))
);
create policy listing_species_read_public_or_member on public.listing_species for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.id = listing_id)
);
create policy product_variants_read_public_or_member on public.product_variants for select to anon, authenticated using (
  (active_status and exists (select 1 from public.listings l where l.id = listing_id and l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null))
  or exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy listing_prices_read_public_or_member on public.listing_prices for select to anon, authenticated using (
  (status = 'active' and valid_from <= now() and (valid_to is null or valid_to > now())
   and exists (select 1 from public.listing_markets lm where lm.listing_id = listing_prices.listing_id and lm.market_code = listing_prices.market_code and lm.availability_status = 'available' and lm.compliance_status = 'approved')
   and exists (select 1 from public.listings l join public.businesses b on b.id = l.business_id
     join public.markets m on m.country_code = listing_prices.market_code
     where l.id = listing_prices.listing_id and l.moderation_status = 'published' and l.archived_at is null
       and b.verification_status = 'verified' and b.is_active and b.archived_at is null and m.market_status = 'active'))
  or exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy listing_images_read_public_or_member on public.listing_images for select to anon, authenticated using (
  (visibility_status = 'visible' and exists (select 1 from public.listings l
     join public.businesses b on b.id = l.business_id
     join public.listing_markets lm on lm.listing_id = l.id
     join public.markets m on m.country_code = lm.market_code
     where l.id = listing_images.listing_id and l.kind = 'product' and l.moderation_status = 'published'
       and l.archived_at is null and b.verification_status = 'verified' and b.is_active and b.archived_at is null
       and lm.availability_status = 'available' and lm.compliance_status = 'approved' and m.market_status = 'active'))
  or exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);

-- Base permissive image policies are narrowed by restrictive policies in the
-- seller hardening migration; leaving direct image DML grants to that migration.
create policy listing_images_reserve_member on public.listing_images for insert to authenticated with check (
  exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and l.kind = 'product' and l.moderation_status in ('draft','rejected')
      and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active' and bm.member_role in ('owner','admin','catalog_manager'))
);
create policy listing_images_update_member on public.listing_images for update to authenticated using (
  exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and l.kind = 'product' and l.moderation_status in ('draft','rejected')
      and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active' and bm.member_role in ('owner','admin','catalog_manager'))
) with check (
  exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and l.kind = 'product' and l.moderation_status in ('draft','rejected')
      and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active' and bm.member_role in ('owner','admin','catalog_manager'))
);
create policy listing_images_delete_member on public.listing_images for delete to authenticated using (
  exists (select 1 from public.listings l join public.business_memberships bm on bm.business_id = l.business_id
    where l.id = listing_id and l.kind = 'product' and l.moderation_status in ('draft','rejected')
      and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active' and bm.member_role in ('owner','admin','catalog_manager'))
);

create policy provider_profiles_read_published on public.provider_profiles for select to anon, authenticated using (
  published_status = 'published' and credential_verification_status in ('verified','not_required')
  and exists (select 1 from public.businesses b where b.id = provider_profiles.business_id and b.verification_status = 'verified' and b.is_active and b.archived_at is null)
  or exists (select 1 from public.business_memberships bm where bm.business_id = provider_profiles.business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy provider_locations_read_public on public.provider_locations for select to anon, authenticated using (
  (is_public and is_active and exists (select 1 from public.businesses b where b.id = provider_locations.business_id and b.verification_status = 'verified' and b.is_active and b.archived_at is null))
  or exists (select 1 from public.business_memberships bm where bm.business_id = provider_locations.business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy service_offerings_read_public_or_member on public.service_offerings for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.id = listing_id and l.kind = 'service')
);
create policy service_rules_read_listing on public.service_availability_rules for select to anon, authenticated using (
  active_status and exists (select 1 from public.listings l where l.id = service_listing_id and l.kind = 'service')
);
create policy service_exceptions_read_listing on public.service_availability_exceptions for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.id = service_listing_id and l.kind = 'service')
);
create policy appointment_slots_read_available on public.appointment_slots for select to anon, authenticated using (
  status = 'available' and starts_at > now() and exists (select 1 from public.listings l where l.id = service_listing_id and l.moderation_status = 'published' and l.kind = 'service')
);
create policy bookings_read_participant on public.bookings for select to authenticated using (
  customer_profile_id = (select auth.uid())
  or exists (select 1 from public.business_memberships bm where bm.business_id = provider_business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);

create policy addresses_manage_self on public.addresses for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy carts_manage_self on public.carts for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and exists (select 1 from public.markets m where m.country_code = carts.market_code and m.market_status = 'active' and m.currency_code = carts.currency_code));
create policy cart_items_manage_own_active_cart on public.cart_items for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = (select auth.uid()) and c.status = 'active'))
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = (select auth.uid()) and c.status = 'active')
    and exists (select 1 from public.listings l join public.listing_markets lm on lm.listing_id = l.id
      where l.id = cart_items.listing_id and l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null
        and lm.market_code = (select c.market_code from public.carts c where c.id = cart_id)
        and lm.availability_status = 'available' and lm.compliance_status = 'approved')
  );
create policy favourites_manage_self on public.favourites for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy orders_read_customer on public.orders for select to authenticated using (customer_profile_id = (select auth.uid()));
create policy order_items_read_participant on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_profile_id = (select auth.uid()))
  or exists (select 1 from public.business_memberships bm where bm.business_id = order_items.business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy fulfilments_read_participant on public.fulfilments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_profile_id = (select auth.uid()))
  or exists (select 1 from public.business_memberships bm where bm.business_id = fulfilments.business_id and bm.profile_id = (select auth.uid()) and bm.membership_status = 'active')
);
create policy fulfilment_items_read_participant on public.fulfilment_items for select to authenticated using (
  exists (select 1 from public.fulfilments f where f.id = fulfilment_id)
);
create policy reviews_read_published_or_self on public.reviews for select to anon, authenticated using (
  moderation_status = 'published' or profile_id = (select auth.uid())
);

revoke all on public.profiles, public.businesses, public.business_memberships, public.business_verification_records,
  public.categories, public.animal_species, public.category_species, public.markets, public.listings,
  public.listing_markets, public.listing_species, public.product_variants, public.listing_prices,
  public.listing_images, public.provider_profiles, public.provider_locations, public.service_offerings,
  public.service_availability_rules, public.service_availability_exceptions, public.appointment_slots, public.bookings,
  public.addresses, public.carts, public.cart_items, public.favourites, public.orders, public.order_items,
  public.fulfilments, public.fulfilment_items, public.payments, public.seller_payment_accounts,
  public.inventory_levels, public.inventory_movements, public.reviews
from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.businesses to anon, authenticated;
grant select on public.business_memberships, public.business_verification_records to authenticated;
grant select on public.categories, public.animal_species, public.category_species, public.markets to anon, authenticated;
grant insert, update, delete on public.categories, public.animal_species, public.category_species, public.markets to authenticated;
grant select on public.listings, public.listing_markets, public.listing_species, public.product_variants,
  public.listing_prices, public.listing_images, public.provider_profiles, public.provider_locations,
  public.service_offerings, public.service_availability_rules, public.service_availability_exceptions,
  public.appointment_slots to anon, authenticated;
grant select on public.bookings to authenticated;
grant select on public.addresses, public.carts, public.cart_items, public.favourites to authenticated;
grant insert, update, delete on public.addresses, public.carts, public.cart_items, public.favourites to authenticated;
grant select on public.orders, public.order_items, public.fulfilments, public.fulfilment_items to authenticated;
grant select on public.reviews to anon, authenticated;

-- Auth-trigger profile creation uses only the Auth user ID and untrusted display
-- metadata; it never derives roles or administrator privileges from user data.
create or replace function public.handle_new_auth_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'full_name'), ''), new.phone)
  on conflict (id) do update set
    full_name = coalesce(profiles.full_name, excluded.full_name),
    phone = coalesce(profiles.phone, excluded.phone);
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();
