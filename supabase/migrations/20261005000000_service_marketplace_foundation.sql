-- Vetit service marketplace foundation. Additive migration; existing rows are preserved.
-- Provider and service records remain private until verified and published.

create table public.service_categories (
  slug text primary key,
  name text not null,
  parent_slug text references public.service_categories(slug),
  allowed_provider_types text[] not null default '{}',
  requires_professional_verification boolean not null default false,
  requires_legal_review boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint service_category_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

insert into public.service_categories
  (slug, name, parent_slug, requires_professional_verification, requires_legal_review, sort_order)
values
  ('veterinary-health', 'Veterinary & animal health', null, true, false, 10),
  ('veterinary-clinic', 'Veterinary clinics', 'veterinary-health', true, false, 11),
  ('veterinarian', 'Individual veterinarians', 'veterinary-health', true, false, 12),
  ('veterinary-surgery', 'Veterinary surgeries & practices', 'veterinary-health', true, false, 13),
  ('emergency-veterinary', 'Emergency veterinary services', 'veterinary-health', true, false, 14),
  ('specialist-veterinary', 'Specialist veterinary services', 'veterinary-health', true, false, 15),
  ('vaccinations-health-checks', 'Vaccinations & health checks', 'veterinary-health', true, false, 16),
  ('dental-diagnostics', 'Dental care & diagnostics', 'veterinary-health', true, false, 17),
  ('veterinary-pharmacy', 'Veterinary pharmacy & medication', 'veterinary-health', true, true, 18),
  ('livestock-veterinary', 'Livestock & cattle veterinary care', 'veterinary-health', true, false, 19),
  ('grooming-care', 'Pet grooming & care', null, false, false, 20),
  ('dog-grooming', 'Dog grooming', 'grooming-care', false, false, 21),
  ('cat-grooming', 'Cat grooming', 'grooming-care', false, false, 22),
  ('bathing-nail-care', 'Bathing & nail care', 'grooming-care', false, false, 23),
  ('mobile-grooming', 'Mobile & at-home grooming', 'grooming-care', false, false, 24),
  ('daycare-boarding', 'Day care & boarding', null, false, false, 30),
  ('dog-daycare', 'Dog daycare', 'daycare-boarding', false, false, 31),
  ('cat-daycare', 'Cat daycare', 'daycare-boarding', false, false, 32),
  ('boarding-kennels-catteries', 'Boarding, kennels & catteries', 'daycare-boarding', false, false, 33),
  ('holiday-overnight-care', 'Holiday & overnight care', 'daycare-boarding', false, false, 34),
  ('pet-sitting', 'Pet sitting & home visits', 'daycare-boarding', false, false, 35),
  ('walking-training', 'Walking & training', null, false, false, 40),
  ('dog-walking', 'Dog walking', 'walking-training', false, false, 41),
  ('training-behaviour', 'Training & behaviour', 'walking-training', false, false, 42),
  ('pet-transport', 'Pet transport & taxi', null, false, false, 50),
  ('animal-photography', 'Animal photography', null, false, false, 60),
  ('activities-events', 'Pet-friendly activities & events', null, false, false, 70),
  ('farm-services', 'Farm & livestock services', null, false, false, 80),
  ('other-animal-care', 'Other animal-care services', null, false, false, 90)
on conflict (slug) do nothing;

insert into public.service_categories (slug, name, parent_slug, sort_order)
values
  ('preventive-health', 'Preventive healthcare', 'veterinary-health', 20),
  ('hair-fur-care', 'Hair & fur care', 'grooming-care', 25),
  ('grooming-packages', 'Grooming packages', 'grooming-care', 26)
on conflict (slug) do nothing;

update public.service_categories set allowed_provider_types = array['veterinary_clinic']
  where slug in ('veterinary-clinic', 'veterinary-pharmacy');
update public.service_categories set allowed_provider_types = array['veterinary_clinic', 'veterinarian', 'livestock_provider']
  where slug = 'veterinary-health';
update public.service_categories set allowed_provider_types = array['veterinarian']
  where slug = 'veterinarian';
update public.service_categories set allowed_provider_types = array['veterinary_clinic', 'veterinarian']
  where slug in ('veterinary-surgery', 'emergency-veterinary', 'specialist-veterinary', 'dental-diagnostics');
update public.service_categories set allowed_provider_types = array['veterinary_clinic', 'veterinarian', 'livestock_provider']
  where slug = 'vaccinations-health-checks';
update public.service_categories set allowed_provider_types = array['veterinarian', 'livestock_provider']
  where slug = 'livestock-veterinary';
update public.service_categories
  set requires_professional_verification = true,
      allowed_provider_types = array['veterinary_clinic', 'veterinarian', 'livestock_provider']
  where slug = 'preventive-health';

create table public.product_categories (
  slug text primary key,
  name text not null,
  parent_slug text references public.product_categories(slug),
  requires_legal_review boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_category_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
insert into public.product_categories (slug, name, parent_slug, requires_legal_review, sort_order)
values
  ('pet-products', 'Pet products', null, false, 10),
  ('dog-nutrition', 'Dog food & nutrition', 'pet-products', false, 11),
  ('cat-wellness', 'Cat wellness & care', 'pet-products', false, 12),
  ('pet-grooming-products', 'Grooming & hygiene', 'pet-products', false, 13),
  ('pet-toys-accessories', 'Toys & accessories', 'pet-products', false, 14),
  ('livestock-cattle', 'Livestock & cattle', null, false, 20),
  ('livestock-feed', 'Livestock & cattle feed', 'livestock-cattle', false, 21),
  ('livestock-supplements', 'Livestock supplements', 'livestock-cattle', false, 22),
  ('livestock-animal-care', 'Livestock animal-care products', 'livestock-cattle', false, 23),
  ('farm-supplies', 'Farm supplies & equipment', 'livestock-cattle', false, 24),
  ('veterinary-medicines', 'Veterinary medicines', null, true, 30),
  ('livestock-medicines', 'Livestock & cattle medicines', 'veterinary-medicines', true, 31)
on conflict (slug) do nothing;

create table public.provider_profiles (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text not null unique,
  provider_type text not null check (provider_type in (
    'veterinary_clinic', 'veterinarian', 'groomer', 'daycare', 'boarding',
    'trainer', 'walker', 'pet_sitter', 'transport', 'livestock_provider', 'other'
  )),
  biography text not null default '',
  public_email text,
  public_phone text,
  website_url text,
  professional_verification_status text not null default 'pending'
    check (professional_verification_status in ('not_required', 'pending', 'verified', 'rejected')),
  professional_verified_at timestamptz,
  profile_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_profile_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.provider_locations (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null default 'Main location',
  address_line text,
  city text not null,
  locality text,
  postal_code text,
  country_code char(2) not null default 'IN' check (country_code = 'IN'),
  location extensions.geography(Point, 4326) not null,
  service_radius_m integer check (service_radius_m is null or service_radius_m > 0),
  is_primary boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_location_city_nonempty check (length(trim(city)) > 0),
  unique (id, business_id)
);

create unique index provider_locations_one_primary_idx
  on public.provider_locations (business_id) where is_primary;
create index provider_locations_city_locality_idx
  on public.provider_locations (lower(city), lower(coalesce(locality, '')));
create index provider_locations_geo_idx
  on public.provider_locations using gist (location);

create table public.service_availability_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  timezone text not null default 'Asia/Kolkata',
  slot_interval_minutes integer check (slot_interval_minutes is null or slot_interval_minutes between 5 and 720),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_rule_time_order check (closes_at > opens_at),
  unique (listing_id, day_of_week, opens_at)
);

create table public.service_availability_exceptions (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  service_date date not null,
  is_available boolean not null default false,
  opens_at time,
  closes_at time,
  note text,
  created_at timestamptz not null default now(),
  constraint availability_exception_times check (
    (opens_at is null and closes_at is null)
    or (opens_at is not null and closes_at is not null and closes_at > opens_at)
  ),
  unique (listing_id, service_date, opens_at)
);

alter table public.listings
  add column service_category_slug text references public.service_categories(slug),
  add column product_category_slug text references public.product_categories(slug),
  add column service_mode text check (service_mode in ('at_provider', 'mobile', 'remote', 'farm_visit')),
  add column provider_location_id uuid,
  add column service_city text,
  add column service_locality text,
  add column public_image_url text,
  add column legal_review_status text not null default 'not_required'
    check (legal_review_status in ('not_required', 'pending', 'approved', 'rejected')),
  add column service_duration_minutes integer check (
    service_duration_minutes is null or service_duration_minutes between 5 and 1440
  );

alter table public.listings
  add constraint listing_provider_location_business_fk
  foreign key (provider_location_id, business_id)
  references public.provider_locations(id, business_id);

create index service_listings_category_city_idx
  on public.listings (service_category_slug, lower(service_city), lower(service_locality))
  where kind = 'service' and status = 'published';

create table public.pets (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  species text not null,
  breed text,
  date_of_birth date,
  sex text check (sex in ('female', 'male', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_name_nonempty check (length(trim(name)) > 0),
  constraint pet_species_nonempty check (length(trim(species)) > 0)
);
create index pets_customer_idx on public.pets (customer_id, created_at);

alter table public.bookings
  add column pet_id uuid references public.pets(id) on delete set null,
  add column provider_timezone text not null default 'Asia/Kolkata',
  add column provider_response_note text,
  add column accepted_at timestamptz,
  add column declined_at timestamptz,
  add column confirmed_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column rescheduled_from_booking_id uuid references public.bookings(id),
  add column cancellation_terms_snapshot jsonb not null default '{}'::jsonb;

-- Concrete slots are generated only from provider-entered availability; none are seeded.
create table public.provider_appointment_slots (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'available' check (status in ('available', 'held', 'booked', 'blocked')),
  held_until timestamptz,
  created_at timestamptz not null default now(),
  constraint appointment_slot_time_order check (ends_at > starts_at),
  unique (listing_id, starts_at),
  unique (id, listing_id)
);
create index appointment_slots_discovery_idx
  on public.provider_appointment_slots (listing_id, starts_at) where status = 'available';

alter table public.bookings add column appointment_slot_id uuid;
alter table public.bookings add constraint booking_appointment_slot_fk
  foreign key (appointment_slot_id) references public.provider_appointment_slots(id);
create unique index bookings_one_active_request_per_slot_idx
  on public.bookings (appointment_slot_id)
  where appointment_slot_id is not null
    and status in ('requested', 'accepted', 'awaiting_payment', 'confirmed');

create table public.booking_events (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_note text,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

create table public.saved_listings (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, listing_id)
);

create table public.listing_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '',
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  unique (booking_id, customer_id)
);

-- Public approval now reflects verified identity. Product publication separately
-- requires verified Route status, while provider services do not require live Route.
create or replace function public.business_is_publicly_approved(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
      and b.verification_status = 'verified'
      and (
        exists (select 1 from public.seller_payment_routing r
          where r.business_id = b.id and r.status = 'verified')
        or exists (select 1 from public.provider_profiles p
          where p.business_id = b.id and p.profile_published_at is not null)
      )
  );
$$;

create or replace function public.listing_can_be_published(
  target_business_id uuid,
  target_kind public.listing_kind,
  target_category_slug text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
      and b.verification_status = 'verified'
      and (
        (target_kind = 'product' and exists (
          select 1 from public.seller_payment_routing r
          where r.business_id = b.id and r.status = 'verified'
        ))
        or
        (target_kind = 'service' and b.kind in ('provider', 'seller_provider')
          and exists (
            select 1 from public.provider_profiles p
            where p.business_id = b.id
              and p.profile_published_at is not null
              and (
                not coalesce((select c.requires_professional_verification
                              from public.service_categories c where c.slug = target_category_slug), false)
                or (p.professional_verification_status = 'verified' and exists (
                  select 1 from public.service_categories c
                  where c.slug = target_category_slug
                    and (cardinality(c.allowed_provider_types) = 0
                      or p.provider_type = any(c.allowed_provider_types))
                ))
              )
          ))
      )
  );
$$;

create or replace function public.search_services_nearby(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer default 25000,
  p_category_slug text default null
)
returns table (
  listing_id uuid,
  business_id uuid,
  provider_slug text,
  title text,
  category_slug text,
  service_city text,
  service_locality text,
  price_paise bigint,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_point as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select l.id, l.business_id, p.slug, l.title, l.service_category_slug,
    coalesce(l.service_city, loc.city), coalesce(l.service_locality, loc.locality), l.price_paise,
    extensions.st_distance(l.service_area, search_point.point)
  from public.listings l
  join public.provider_profiles p on p.business_id = l.business_id
  left join public.provider_locations loc on loc.id = l.provider_location_id and loc.is_public
  cross join search_point
  where p_latitude between -90 and 90
    and p_longitude between -180 and 180
    and p_radius_m between 100 and 100000
    and l.kind = 'service'
    and l.status = 'published'
    and (p_category_slug is null or l.service_category_slug = p_category_slug)
    and extensions.st_dwithin(l.service_area, search_point.point,
      least(p_radius_m, coalesce(l.service_radius_m, p_radius_m)))
    and (select public.listing_can_be_published(l.business_id, l.kind, l.service_category_slug))
  order by distance_m
  limit 100;
$$;
grant execute on function public.search_services_nearby(double precision, double precision, integer, text)
  to anon, authenticated;

create or replace function public.enforce_listing_publication_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
     and not public.listing_can_be_published(new.business_id, new.kind, new.service_category_slug) then
    raise exception 'Verified sellers with eligible payment routing or verified providers are required to publish listings.';
  end if;
  if new.status = 'published' and new.kind = 'service'
     and (new.service_category_slug is null or new.service_mode is null) then
    raise exception 'Published service listings require a service category and delivery mode.';
  end if;
  if new.status = 'published' and new.service_category_slug is not null
     and exists (select 1 from public.service_categories c
       where c.slug = new.service_category_slug and c.requires_legal_review)
     and new.legal_review_status <> 'approved' then
    raise exception 'This regulated service category requires documented legal review before publication.';
  end if;
  if new.status = 'published' and new.product_category_slug is not null
     and exists (select 1 from public.product_categories c
       where c.slug = new.product_category_slug and c.requires_legal_review)
     and new.legal_review_status <> 'approved' then
    raise exception 'This regulated product category requires documented legal review before publication.';
  end if;
  return new;
end;
$$;

drop policy if exists "Owners and public read businesses" on public.businesses;
create policy "Owners and verified public businesses" on public.businesses
  for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (select public.business_is_publicly_approved(businesses.id)));

drop policy if exists "Read published or owned listings" on public.listings;
create policy "Read approved published or owned listings" on public.listings
  for select to anon, authenticated
  using (
    (status = 'published' and (select public.listing_can_be_published(
      listings.business_id, listings.kind, listings.service_category_slug
    )))
    or exists (
      select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owners edit unpublished listings" on public.listings;
create policy "Owners manage listings awaiting moderation" on public.listings
  for update to authenticated
  using (
    status in ('draft', 'submitted', 'rejected', 'archived')
    and exists (select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid()))
  )
  with check (
    status in ('draft', 'submitted', 'rejected', 'archived')
    and exists (select 1 from public.businesses b
      where b.id = listings.business_id and b.owner_id = (select auth.uid()))
  );
create policy "Owners archive published listings" on public.listings
  for update to authenticated
  using (status = 'published' and exists (
    select 1 from public.businesses b where b.id = listings.business_id and b.owner_id = (select auth.uid())
  ))
  with check (status = 'archived' and exists (
    select 1 from public.businesses b where b.id = listings.business_id and b.owner_id = (select auth.uid())
  ));

alter table public.service_categories enable row level security;
alter table public.product_categories enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_locations enable row level security;
alter table public.service_availability_rules enable row level security;
alter table public.service_availability_exceptions enable row level security;
alter table public.pets enable row level security;
alter table public.saved_listings enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.provider_appointment_slots enable row level security;
alter table public.booking_events enable row level security;

create policy "Read active service categories" on public.service_categories
  for select to anon, authenticated using (is_active);
create policy "Admins manage service categories" on public.service_categories
  for all to authenticated using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));
create policy "Read active product categories" on public.product_categories
  for select to anon, authenticated using (is_active);
create policy "Admins manage product categories" on public.product_categories
  for all to authenticated using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create policy "Read published verified provider profiles" on public.provider_profiles
  for select to anon, authenticated
  using (
    exists (select 1 from public.businesses b where b.id = provider_profiles.business_id
      and b.owner_id = (select auth.uid()))
    or (profile_published_at is not null and exists (
      select 1 from public.businesses b where b.id = provider_profiles.business_id
        and b.verification_status = 'verified'
    ))
  );
create policy "Owners manage provider profiles" on public.provider_profiles
  for insert to authenticated with check (exists (
    select 1 from public.businesses b where b.id = provider_profiles.business_id
      and b.owner_id = (select auth.uid()) and b.kind in ('provider', 'seller_provider')
  ));
create policy "Owners update provider profiles" on public.provider_profiles
  for update to authenticated using (exists (
    select 1 from public.businesses b where b.id = provider_profiles.business_id
      and b.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.businesses b where b.id = provider_profiles.business_id
      and b.owner_id = (select auth.uid())
  ));
create policy "Admins manage provider profiles" on public.provider_profiles
  for all to authenticated using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create function public.protect_provider_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_marketplace_admin()) then
    if tg_op = 'INSERT' then
      if new.professional_verification_status <> 'pending'
         or new.professional_verified_at is not null
         or new.profile_published_at is not null then
        raise exception 'Provider verification and profile publication require Vetit review.';
      end if;
    elsif new.professional_verification_status is distinct from old.professional_verification_status
       or new.professional_verified_at is distinct from old.professional_verified_at
       or new.profile_published_at is distinct from old.profile_published_at then
      raise exception 'Provider verification and profile publication require Vetit review.';
    end if;
  end if;
  return new;
end;
$$;
create trigger provider_profiles_protect_verification
  before insert or update on public.provider_profiles
  for each row execute function public.protect_provider_verification_fields();

create policy "Read public provider locations" on public.provider_locations
  for select to anon, authenticated using (
    is_public and exists (select 1 from public.businesses b
      join public.provider_profiles p on p.business_id = b.id
      where b.id = provider_locations.business_id and b.verification_status = 'verified'
        and p.profile_published_at is not null)
  );
create policy "Owners manage provider locations" on public.provider_locations
  for all to authenticated using (exists (
    select 1 from public.businesses b where b.id = provider_locations.business_id
      and b.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.businesses b where b.id = provider_locations.business_id
      and b.owner_id = (select auth.uid())
  ));

create policy "Read published service availability" on public.service_availability_rules
  for select to anon, authenticated using (exists (
    select 1 from public.listings l where l.id = service_availability_rules.listing_id
      and l.kind = 'service' and l.status = 'published'
      and (select public.listing_can_be_published(l.business_id, l.kind, l.service_category_slug))
  ));
create policy "Owners manage service availability" on public.service_availability_rules
  for all to authenticated using (exists (
    select 1 from public.listings l join public.businesses b on b.id = l.business_id
    where l.id = service_availability_rules.listing_id and b.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.listings l join public.businesses b on b.id = l.business_id
    where l.id = service_availability_rules.listing_id and b.owner_id = (select auth.uid())
  ));
create policy "Read published service availability exceptions" on public.service_availability_exceptions
  for select to anon, authenticated using (exists (
    select 1 from public.listings l where l.id = service_availability_exceptions.listing_id
      and l.kind = 'service' and l.status = 'published'
      and (select public.listing_can_be_published(l.business_id, l.kind, l.service_category_slug))
  ));
create policy "Owners manage availability exceptions" on public.service_availability_exceptions
  for all to authenticated using (exists (
    select 1 from public.listings l join public.businesses b on b.id = l.business_id
    where l.id = service_availability_exceptions.listing_id and b.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.listings l join public.businesses b on b.id = l.business_id
    where l.id = service_availability_exceptions.listing_id and b.owner_id = (select auth.uid())
  ));

create policy "Read available future appointment slots" on public.provider_appointment_slots
  for select to anon, authenticated using (
    status = 'available' and starts_at > now() and exists (
      select 1 from public.listings l where l.id = provider_appointment_slots.listing_id
        and l.kind = 'service' and l.status = 'published'
        and (select public.listing_can_be_published(l.business_id, l.kind, l.service_category_slug))
    )
  );
create policy "Providers read their appointment slots" on public.provider_appointment_slots
  for select to authenticated using (exists (
    select 1 from public.listings l join public.businesses b on b.id = l.business_id
    where l.id = provider_appointment_slots.listing_id and b.owner_id = (select auth.uid())
  ));
create policy "Admins manage appointment slots" on public.provider_appointment_slots
  for all to authenticated using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));
create policy "Customers and providers read booking events" on public.booking_events
  for select to authenticated using (
    exists (select 1 from public.bookings bk where bk.id = booking_events.booking_id
      and (bk.customer_id = (select auth.uid())
        or exists (select 1 from public.businesses b where b.id = bk.provider_business_id
          and b.owner_id = (select auth.uid()))))
    or (select public.is_marketplace_admin())
  );

create policy "Customers manage own pets" on public.pets
  for all to authenticated using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));
create policy "Customers manage own saved listings" on public.saved_listings
  for all to authenticated using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));
create policy "Read published listing reviews" on public.listing_reviews
  for select to anon, authenticated using (status = 'published');
create policy "Customers read own reviews" on public.listing_reviews
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Admins moderate listing reviews" on public.listing_reviews
  for all to authenticated using ((select public.is_marketplace_admin()))
  with check ((select public.is_marketplace_admin()));

create trigger provider_profiles_set_updated_at before update on public.provider_profiles
  for each row execute function public.set_updated_at();
create trigger provider_locations_set_updated_at before update on public.provider_locations
  for each row execute function public.set_updated_at();
create trigger pets_set_updated_at before update on public.pets
  for each row execute function public.set_updated_at();

-- Appointment transitions and review creation stay server-controlled. This migration
-- provides schedules and private pet profiles but does not create fake slots/bookings.
-- Disable the original bare client-side request policy until a trusted endpoint can
-- validate and reserve a concrete slot atomically.
drop policy if exists "Customers request bookings" on public.bookings;
