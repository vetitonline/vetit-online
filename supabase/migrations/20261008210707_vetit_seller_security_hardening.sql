-- Review-only hardening for the seller foundation migration.
-- Apply this only after 20261008092024_vetit_seller_backend_foundation.sql.
-- Safe to rerun: owned policies/triggers are replaced, grants are repeatable,
-- and an existing incompatible Storage bucket is rejected instead of changed.

create or replace function public.create_seller_business(
  p_display_name text,
  p_legal_name text,
  p_business_type text,
  p_public_email text,
  p_public_phone text,
  p_website_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  business_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication is required to create a seller profile.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 or length(trim(p_display_name)) > 120
     or length(coalesce(trim(p_legal_name), '')) > 180 then
    raise exception 'Enter a business name between 2 and 120 characters.' using errcode = '22023';
  end if;
  if p_business_type is null or p_business_type not in ('individual', 'company', 'farm', 'other') then
    raise exception 'Choose a valid seller business type.' using errcode = '22023';
  end if;
  if p_public_email is not null and (length(trim(p_public_email)) > 254 or trim(p_public_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid public email address.' using errcode = '22023';
  end if;
  if length(coalesce(trim(p_public_phone), '')) > 32 then
    raise exception 'Public phone number is too long.' using errcode = '22023';
  end if;
  if p_website_url is not null and (length(trim(p_website_url)) > 2048 or trim(p_website_url) !~* '^https?://[^[:space:]]+$') then
    raise exception 'Enter a valid public website URL.' using errcode = '22023';
  end if;

  -- Provision the authenticated user's profile idempotently. The auth UUID is
  -- the only accepted identity; never accept profile identity or role from input.
  insert into public.profiles (id)
  values (requester_id)
  on conflict (id) do nothing;

  -- The profile row is the per-user mutex. One active owner business is reused
  -- on retries, including concurrent requests; registration never duplicates it.
  perform p.id from public.profiles p where p.id = requester_id for update;
  if not found then raise exception 'Unable to initialize the signed-in profile.' using errcode = '23503'; end if;
  select m.business_id into business_id
  from public.business_memberships m
  join public.businesses b on b.id = m.business_id
  where m.profile_id = requester_id and m.member_role = 'owner' and m.membership_status = 'active'
    and b.business_type in ('individual', 'company', 'farm', 'other')
  order by m.created_at, m.business_id limit 1;
  if found then return business_id; end if;

  insert into public.businesses (display_name, legal_name, business_type, public_email, public_phone, website_url, country_code)
  values (trim(p_display_name), nullif(trim(p_legal_name), ''), p_business_type,
    nullif(lower(trim(p_public_email)), ''), nullif(trim(p_public_phone), ''), nullif(trim(p_website_url), ''), 'IN')
  returning id into business_id;

  insert into public.business_memberships (business_id, profile_id, member_role, membership_status)
  values (business_id, requester_id, 'owner', 'active');
  return business_id;
end;
$$;
revoke all on function public.create_seller_business(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_seller_business(text, text, text, text, text, text) to authenticated;

create or replace function public.save_seller_product(
  p_listing_id uuid,
  p_business_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category_id uuid,
  p_species_ids uuid[],
  p_base_amount_minor bigint,
  p_variants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  current_listing public.listings%rowtype;
  saved_listing_id uuid;
  market_currency text;
  variants_json jsonb := coalesce(p_variants, '[]'::jsonb);
  normalized_variants jsonb := '[]'::jsonb;
  normalized_skus text[] := '{}';
  item jsonb;
  variant_id uuid;
  variant_sku text;
  variant_name text;
  variant_value text;
  variant_amount bigint;
  option_json jsonb;
  active_variant_count integer;
begin
  if requester_id is null then
    raise exception 'Authentication is required to manage seller products.' using errcode = '42501';
  end if;
  perform b.id from public.businesses b
  where b.id = p_business_id and b.is_active and b.archived_at is null for share;
  if not found then raise exception 'This seller profile is inactive.' using errcode = '42501'; end if;
  perform m.business_id from public.business_memberships m
  where m.business_id = p_business_id and m.profile_id = requester_id
    and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager') for share;
  if not found then raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501'; end if;

  if nullif(trim(p_title), '') is null or length(trim(p_title)) > 160
     or nullif(trim(p_slug), '') is null or length(trim(p_slug)) > 100
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or length(coalesce(p_description, '')) > 5000 then
    raise exception 'Product details are incomplete or invalid.' using errcode = '22023';
  end if;
  perform c.id from public.categories c
  where c.id = p_category_id and c.kind in ('product', 'both') and c.moderation_status = 'active' for share;
  if not found then raise exception 'Choose an active Vetit product category.' using errcode = '22023'; end if;

  if p_species_ids is null or cardinality(p_species_ids) < 1 or cardinality(p_species_ids) > 8
     or cardinality(p_species_ids) <> (select count(distinct s.id) from unnest(p_species_ids) as s(id))
     or exists (
       select 1 from unnest(p_species_ids) as s(id)
       left join public.animal_species a on a.id = s.id
       where a.id is null or not a.is_active
     ) then
    raise exception 'Choose 1 to 8 unique active pets or livestock types.' using errcode = '22023';
  end if;
  if exists (select 1 from public.category_species cs where cs.category_id = p_category_id)
     and exists (
       select 1 from unnest(p_species_ids) as s(id)
       where not exists (select 1 from public.category_species cs where cs.category_id = p_category_id and cs.species_id = s.id)
     ) then
    raise exception 'The selected category is not available for one of these species.' using errcode = '22023';
  end if;

  -- Check the JSON type before calling array-only operators. Validate each
  -- element and normalize SKU strings before any row is written.
  if jsonb_typeof(variants_json) is distinct from 'array' then
    raise exception 'Product variants must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(variants_json) > 20 then
    raise exception 'A product can have at most 20 variants.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(variants_json) as v(value)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Each variant must be a JSON object.' using errcode = '22023';
    end if;
    if jsonb_typeof(item->'seller_sku') is distinct from 'string'
       or jsonb_typeof(item->'option_attributes') is distinct from 'object'
       or jsonb_typeof(item->'amount_minor') is distinct from 'number' then
      raise exception 'Each variant must include a SKU, one option, and an INR amount.' using errcode = '22023';
    end if;
    if jsonb_object_length(item->'option_attributes') <> 1 then
      raise exception 'Each variant must have exactly one option.' using errcode = '22023';
    end if;
    variant_sku := upper(regexp_replace(trim(item->>'seller_sku'), '[[:space:]]+', '-', 'g'));
    if variant_sku = '' or length(variant_sku) > 80 or variant_sku !~ '^[A-Z0-9][A-Z0-9._-]*$'
       or variant_sku = any(normalized_skus) then
      raise exception 'Variant SKUs must be valid and unique after normalization.' using errcode = '22023';
    end if;
    select key, value into variant_name, option_json
    from jsonb_each(item->'option_attributes') as o(key, value) limit 1;
    if jsonb_typeof(option_json) is distinct from 'string' then
      raise exception 'Variant option values must be text.' using errcode = '22023';
    end if;
    variant_value := trim(option_json #>> '{}');
    variant_name := trim(variant_name);
    if variant_name = '' or length(variant_name) > 60 or variant_value = '' or length(variant_value) > 120 then
      raise exception 'Variant option names and values are required and must fit their limits.' using errcode = '22023';
    end if;
    if (item->>'amount_minor') !~ '^[0-9]{1,10}$' then
      raise exception 'Variant prices must be positive whole INR minor units.' using errcode = '22023';
    end if;
    variant_amount := (item->>'amount_minor')::bigint;
    if variant_amount < 1 or variant_amount > 9999999900 then
      raise exception 'Enter a valid INR variant price.' using errcode = '22023';
    end if;
    normalized_skus := array_append(normalized_skus, variant_sku);
    normalized_variants := normalized_variants || jsonb_build_array(jsonb_set(item, '{seller_sku}', to_jsonb(variant_sku), true));
  end loop;
  if jsonb_array_length(normalized_variants) = 0 then
    if p_base_amount_minor is null or p_base_amount_minor < 1 or p_base_amount_minor > 9999999900 then
      raise exception 'Enter a valid INR price.' using errcode = '22023';
    end if;
  elsif p_base_amount_minor is not null then
    raise exception 'Use either a base price or variant prices.' using errcode = '22023';
  end if;
  select m.currency_code into market_currency from public.markets m
  where m.country_code = 'IN' and m.market_status = 'active' for share;
  if market_currency is distinct from 'INR' then
    raise exception 'The India market is not available for seller prices.' using errcode = '22023';
  end if;

  perform set_config('vetit.seller_action', 'save', true);
  if p_listing_id is null then
    insert into public.listings (business_id, kind, category_id, title, slug, description)
    values (p_business_id, 'product', p_category_id, trim(p_title), trim(p_slug), coalesce(trim(p_description), ''))
    returning id into saved_listing_id;
  else
    select l.* into current_listing from public.listings l
    where l.id = p_listing_id and l.business_id = p_business_id and l.archived_at is null for update;
    if not found or current_listing.kind <> 'product' or current_listing.moderation_status not in ('draft', 'rejected') then
      raise exception 'Only your unarchived draft or rejected product listings can be edited.' using errcode = '42501';
    end if;
    update public.listings l set category_id = p_category_id, title = trim(p_title), slug = trim(p_slug),
      description = coalesce(trim(p_description), ''), updated_at = now()
    where l.id = p_listing_id returning l.id into saved_listing_id;
  end if;

  if exists (
    select 1 from public.product_variants v
    where v.listing_id = saved_listing_id
      and upper(regexp_replace(trim(v.seller_sku), '[[:space:]]+', '-', 'g')) = any(normalized_skus)
    group by upper(regexp_replace(trim(v.seller_sku), '[[:space:]]+', '-', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Existing variant SKUs collide after normalization; ask Vetit support to review this draft.' using errcode = '22023';
  end if;

  delete from public.listing_species where listing_id = saved_listing_id;
  insert into public.listing_species (listing_id, species_id)
  select saved_listing_id, s.id from unnest(p_species_ids) as s(id);

  insert into public.listing_markets (listing_id, market_code, availability_status, compliance_status)
  values (saved_listing_id, 'IN', 'available', 'pending')
  on conflict (listing_id, market_code) do update
    set availability_status = 'available', compliance_status = 'pending';

  if jsonb_array_length(normalized_variants) = 0 then
    update public.product_variants set active_status = false, updated_at = now()
    where listing_id = saved_listing_id and active_status;
    update public.listing_prices set status = 'inactive', valid_to = now()
    where listing_id = saved_listing_id and status = 'active';
    insert into public.listing_prices (listing_id, market_code, product_variant_id, currency_code, amount_minor, status)
    values (saved_listing_id, 'IN', null, market_currency, p_base_amount_minor, 'active');
  else
    update public.product_variants v set active_status = false, updated_at = now()
    where v.listing_id = saved_listing_id and v.active_status
      and upper(regexp_replace(trim(v.seller_sku), '[[:space:]]+', '-', 'g')) <> all(normalized_skus);
    update public.listing_prices p set status = 'inactive', valid_to = now()
    where p.listing_id = saved_listing_id and p.status = 'active'
      and (p.product_variant_id is null or exists (
        select 1 from public.product_variants v where v.id = p.product_variant_id and not v.active_status
      ));
    for item in select value from jsonb_array_elements(normalized_variants) as v(value)
    loop
      variant_sku := item->>'seller_sku';
      select key, value into variant_name, option_json
      from jsonb_each(item->'option_attributes') as o(key, value) limit 1;
      variant_value := option_json #>> '{}';
      variant_amount := (item->>'amount_minor')::bigint;
      select v.id into variant_id from public.product_variants v
      where v.listing_id = saved_listing_id
        and upper(regexp_replace(trim(v.seller_sku), '[[:space:]]+', '-', 'g')) = variant_sku
      order by v.created_at, v.id limit 1 for update;
      if found then
        update public.product_variants v set seller_sku = variant_sku, option_attributes = item->'option_attributes',
          active_status = true, updated_at = now() where v.id = variant_id;
      else
        insert into public.product_variants (listing_id, seller_sku, option_attributes, active_status)
        values (saved_listing_id, variant_sku, item->'option_attributes', true) returning id into variant_id;
      end if;
      update public.listing_prices set status = 'inactive', valid_to = now()
      where listing_id = saved_listing_id and product_variant_id = variant_id and status = 'active';
      insert into public.listing_prices (listing_id, market_code, product_variant_id, currency_code, amount_minor, status)
      values (saved_listing_id, 'IN', variant_id, market_currency, variant_amount, 'active');
    end loop;
  end if;
  return saved_listing_id;
end;
$$;
revoke all on function public.save_seller_product(uuid, uuid, text, text, text, uuid, uuid[], bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_seller_product(uuid, uuid, text, text, text, uuid, uuid[], bigint, jsonb) to authenticated;

create or replace function public.submit_seller_product(p_business_id uuid, p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  market_row public.listing_markets%rowtype;
  active_variants integer;
begin
  if requester_id is null then raise exception 'Authentication is required to submit a product.' using errcode = '42501'; end if;
  perform b.id from public.businesses b
  where b.id = p_business_id and b.is_active and b.archived_at is null for share;
  if not found then raise exception 'This seller profile is inactive.' using errcode = '42501'; end if;
  perform m.business_id from public.business_memberships m
  where m.business_id = p_business_id and m.profile_id = requester_id and m.membership_status = 'active'
    and m.member_role in ('owner', 'admin', 'catalog_manager') for share;
  if not found then raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501'; end if;

  select l.* into listing_row from public.listings l
  where l.id = p_listing_id and l.business_id = p_business_id and l.archived_at is null for update;
  if not found or listing_row.kind <> 'product' or listing_row.moderation_status not in ('draft', 'rejected') then
    raise exception 'Only your unarchived draft or rejected product listings can be submitted.' using errcode = '42501';
  end if;
  perform c.id from public.categories c
  where c.id = listing_row.category_id and c.kind in ('product', 'both') and c.moderation_status = 'active' for share;
  if not found then raise exception 'The product category is no longer active.' using errcode = '22023'; end if;
  if (select count(*) from public.listing_species s where s.listing_id = p_listing_id) not between 1 and 8
     or exists (
       select 1 from public.listing_species s
       left join public.animal_species a on a.id = s.species_id
       where s.listing_id = p_listing_id and (a.id is null or not a.is_active)
     )
     or exists (
       select 1 from public.category_species cs where cs.category_id = listing_row.category_id
     ) and exists (
       select 1 from public.listing_species s
       where s.listing_id = p_listing_id and not exists (
         select 1 from public.category_species cs where cs.category_id = listing_row.category_id and cs.species_id = s.species_id
       )
     ) then
    raise exception 'Choose active species supported by this product category.' using errcode = '22023';
  end if;
  select lm.* into market_row from public.listing_markets lm
  where lm.listing_id = p_listing_id and lm.market_code = 'IN' for update;
  if not found or market_row.availability_status <> 'available' or market_row.compliance_status <> 'pending' then
    raise exception 'The India product market must be available and awaiting compliance review.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.markets m where m.country_code = 'IN' and m.market_status = 'active' and m.currency_code = 'INR') then
    raise exception 'The India INR market is not active.' using errcode = '22023';
  end if;
    if exists (
      select 1 from public.listing_images li where li.listing_id = p_listing_id
        and not exists (select 1 from storage.objects o where o.bucket_id = 'listing-images' and o.name = li.storage_object_path)
    ) then raise exception 'Remove incomplete product photo reservations before publishing.' using errcode = '22023'; end if;

  select count(*) into active_variants from public.product_variants v
  where v.listing_id = p_listing_id and v.active_status;
  if active_variants = 0 then
    if (select count(*) from public.listing_prices p
      where p.listing_id = p_listing_id and p.product_variant_id is null and p.market_code = 'IN'
        and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
        and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1 then
      raise exception 'Exactly one effective positive INR product price is required.' using errcode = '22023';
    end if;
  else
    if exists (
      select 1 from public.product_variants v
      where v.listing_id = p_listing_id and v.active_status and not exists (
        select 1 from public.listing_prices p
        where p.listing_id = p_listing_id and p.product_variant_id = v.id and p.market_code = 'IN'
          and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())
      )
      ) or exists (
      select 1 from public.listing_prices p
      where p.listing_id = p_listing_id and p.product_variant_id is null and p.market_code = 'IN'
        and p.currency_code = 'INR' and p.status = 'active' and p.valid_from <= now()
        and (p.valid_to is null or p.valid_to > now())
    ) then raise exception 'Every active product variant requires an effective INR price.' using errcode = '22023'; end if;
    if exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status
        and (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1
    ) then raise exception 'Each active variant must have exactly one effective INR price.' using errcode = '22023'; end if;
  end if;

  perform set_config('vetit.seller_action', 'submit', true);
  update public.listings l set moderation_status = 'submitted', moderated_by = null, moderated_at = null, updated_at = now()
  where l.id = p_listing_id;
  return p_listing_id;
end;
$$;
revoke all on function public.submit_seller_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_seller_product(uuid, uuid) to authenticated;

create or replace function public.cancel_seller_image_reservation(p_image_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  image_row public.listing_images%rowtype;
  listing_row public.listings%rowtype;
  listing_business_id uuid;
begin
  if requester_id is null then raise exception 'Authentication is required to manage product photos.' using errcode = '42501'; end if;
  select li.* into image_row from public.listing_images li where li.id = p_image_id;
  if not found then return p_image_id; end if;
  select l.business_id into listing_business_id from public.listings l where l.id = image_row.listing_id;
  if not found then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  perform b.id from public.businesses b where b.id = listing_business_id and b.is_active and b.archived_at is null for share;
  if not found then raise exception 'Seller profile is inactive.' using errcode = '42501'; end if;
  perform m.business_id from public.business_memberships m where m.business_id = listing_business_id
    and m.profile_id = requester_id and m.membership_status = 'active'
    and m.member_role in ('owner', 'admin', 'catalog_manager') for share;
  if not found then raise exception 'You do not have catalog access to this product.' using errcode = '42501'; end if;
  select l.* into listing_row from public.listings l where l.id = image_row.listing_id for update;
  if not found or listing_row.archived_at is not null then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  if listing_row.moderation_status not in ('draft', 'rejected', 'submitted') then
    raise exception 'Photos on a published product cannot be removed by sellers.' using errcode = '42501';
  end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'listing-images' and o.name = image_row.storage_object_path) then
    raise exception 'Remove the stored photo through Supabase Storage before releasing its reservation.' using errcode = '42501';
  end if;
  delete from public.listing_images li where li.id = p_image_id;
  return p_image_id;
end;
$$;
revoke all on function public.cancel_seller_image_reservation(uuid) from public, anon, authenticated;
grant execute on function public.cancel_seller_image_reservation(uuid) to authenticated;

create or replace function public.review_seller_business(p_business_id uuid, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false) is not true then
    raise exception 'Vetit administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('verified', 'rejected', 'suspended') then
    raise exception 'Choose a supported business review decision.' using errcode = '22023';
  end if;
  perform b.id from public.businesses b where b.id = p_business_id for update;
  if not found then raise exception 'Seller profile not found.' using errcode = 'P0002'; end if;
  perform set_config('vetit.seller_action', 'business_moderation', true);
  update public.businesses b set verification_status = p_decision, is_active = (p_decision <> 'suspended'), updated_at = now()
  where b.id = p_business_id;
  return p_business_id;
end;
$$;
revoke all on function public.review_seller_business(uuid, text) from public, anon, authenticated;
grant execute on function public.review_seller_business(uuid, text) to authenticated;

create or replace function public.review_seller_listing(p_listing_id uuid, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  business_row public.businesses%rowtype;
  listing_business_id uuid;
  active_variants integer;
begin
  if requester_id is null or coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false) is not true then
    raise exception 'Vetit administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('publish', 'reject') then
    raise exception 'Choose publish or reject.' using errcode = '22023';
  end if;
  select l.business_id into listing_business_id from public.listings l where l.id = p_listing_id;
  if not found then raise exception 'Product listing not found.' using errcode = 'P0002'; end if;
  select b.* into business_row from public.businesses b where b.id = listing_business_id for share;
  if not found then raise exception 'Seller profile not found.' using errcode = 'P0002'; end if;
  select l.* into listing_row from public.listings l where l.id = p_listing_id for update;
  if not found or listing_row.kind <> 'product' or listing_row.archived_at is not null or listing_row.moderation_status <> 'submitted' then
    raise exception 'Only an unarchived product submitted for review can be moderated.' using errcode = '22023';
  end if;

  if p_decision = 'publish' then
    if not business_row.is_active or business_row.archived_at is not null or business_row.verification_status <> 'verified' then
      raise exception 'Only an active verified seller can publish products.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.categories c where c.id = listing_row.category_id and c.kind in ('product', 'both') and c.moderation_status = 'active') then
      raise exception 'The product category is no longer active.' using errcode = '22023';
    end if;
    if (select count(*) from public.listing_species s where s.listing_id = p_listing_id) not between 1 and 8
       or not exists (select 1 from public.listing_species s join public.animal_species a on a.id = s.species_id where s.listing_id = p_listing_id and a.is_active)
       or exists (select 1 from public.listing_species s join public.animal_species a on a.id = s.species_id where s.listing_id = p_listing_id and not a.is_active)
       or exists (select 1 from public.category_species cs where cs.category_id = listing_row.category_id)
          and exists (select 1 from public.listing_species s where s.listing_id = p_listing_id and not exists (select 1 from public.category_species cs where cs.category_id = listing_row.category_id and cs.species_id = s.species_id)) then
      raise exception 'The product must have valid active species for its category.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.markets m where m.country_code = 'IN' and m.market_status = 'active' and m.currency_code = 'INR') then
      raise exception 'The India INR market is not active.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.listing_images li where li.listing_id = p_listing_id
        and not exists (select 1 from storage.objects o where o.bucket_id = 'listing-images' and o.name = li.storage_object_path)
    ) then raise exception 'Remove incomplete product photo reservations before publishing.' using errcode = '22023'; end if;
    select count(*) into active_variants from public.product_variants v where v.listing_id = p_listing_id and v.active_status;
    if active_variants = 0 then
      if (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id is null
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1 then
        raise exception 'Exactly one current positive INR price is required to publish.' using errcode = '22023';
      end if;
    elsif exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status and not exists (
        select 1 from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())
      )
    ) then raise exception 'Every active variant must have a current INR price to publish.' using errcode = '22023'; end if;
    if exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status
        and (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now())) <> 1
    ) then raise exception 'Each active variant must have exactly one current INR price.' using errcode = '22023'; end if;
  end if;

  perform set_config('vetit.seller_action', 'moderation', true);
  update public.listing_markets lm set compliance_status = case when p_decision = 'publish' then 'approved' else 'rejected' end
  where lm.listing_id = p_listing_id and lm.market_code = 'IN' and lm.availability_status = 'available';
  if not found then raise exception 'An available India listing market is required.' using errcode = '22023'; end if;
  update public.listings l set moderation_status = case when p_decision = 'publish' then 'published' else 'rejected' end,
    moderated_by = requester_id, moderated_at = now(), updated_at = now()
  where l.id = p_listing_id;
  return p_listing_id;
end;
$$;
revoke all on function public.review_seller_listing(uuid, text) from public, anon, authenticated;
grant execute on function public.review_seller_listing(uuid, text) to authenticated;

create or replace function public.seller_image_path_is_canonical(p_path text, p_business_id uuid, p_listing_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_path ~* ('^' || p_business_id::text || '/' || p_listing_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|avif)$'), false);
$$;
revoke all on function public.seller_image_path_is_canonical(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.seller_image_path_is_canonical(text, uuid, uuid) to anon, authenticated;

create or replace function public.guard_seller_catalog_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  is_vetit_admin boolean := coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false);
  seller_action text := coalesce(current_setting('vetit.seller_action', true), '');
  parent_id uuid;
  parent_business_id uuid;
  parent_status text;
  parent_archived timestamptz;
  business_active boolean;
  business_archived timestamptz;
  role_allowed boolean;
  image_count integer;
  allow_submitted_image_cleanup boolean := false;
begin
  if tg_table_name = 'businesses' then
    if new.business_type is distinct from old.business_type
       or new.country_code is distinct from old.country_code
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Seller profile type, market and archive state are controlled by Vetit.' using errcode = '42501';
    end if;
    if (new.verification_status is distinct from old.verification_status or new.is_active is distinct from old.is_active)
       and (not is_vetit_admin or seller_action <> 'business_moderation') then
      raise exception 'Use the Vetit business review operation to change verification.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      if seller_action <> 'save' or new.kind <> 'product' or new.moderation_status <> 'draft'
         or new.moderated_by is not null or new.moderated_at is not null then
        raise exception 'Listings must be created as seller product drafts through the seller operation.' using errcode = '42501';
      end if;
      parent_id := new.id;
      parent_business_id := new.business_id;
    else
      parent_id := old.id;
      parent_business_id := old.business_id;
      if new.id is distinct from old.id or new.business_id is distinct from old.business_id
         or new.kind is distinct from old.kind or new.archived_at is distinct from old.archived_at then
        raise exception 'Listing identity, business, kind and archive state are immutable through seller operations.' using errcode = '42501';
      end if;
      if (new.category_id is distinct from old.category_id or new.title is distinct from old.title
          or new.slug is distinct from old.slug or new.description is distinct from old.description)
         and seller_action <> 'save' then
        raise exception 'Listing content must be changed through the seller draft operation.' using errcode = '42501';
      end if;
      if new.moderated_by is distinct from old.moderated_by or new.moderated_at is distinct from old.moderated_at then
        if not is_vetit_admin or seller_action <> 'moderation' then
          raise exception 'Only the scoped Vetit moderation operation can change review metadata.' using errcode = '42501';
        end if;
      end if;
      if new.moderation_status is distinct from old.moderation_status then
        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected') and new.moderation_status = 'submitted'
           and new.moderated_by is null and new.moderated_at is null then
          null;
        elsif seller_action = 'moderation' and is_vetit_admin and old.moderation_status = 'submitted'
           and new.moderation_status in ('published', 'rejected') then
          null;
        else
          raise exception 'Use submit_seller_product or the scoped Vetit review operation to change listing status.' using errcode = '42501';
        end if;
      elsif old.moderation_status in ('submitted', 'published') and seller_action = 'save' then
        raise exception 'Products in review or published cannot be edited by sellers.' using errcode = '42501';
      end if;
      if old.moderation_status in ('submitted', 'published')
         and (new.category_id is distinct from old.category_id or new.title is distinct from old.title
              or new.slug is distinct from old.slug or new.description is distinct from old.description) then
        raise exception 'Products in review or published cannot be edited by sellers.' using errcode = '42501';
      end if;
    end if;

    select b.is_active, b.archived_at into business_active, business_archived
    from public.businesses b where b.id = parent_business_id for share;
    if not found or not business_active or business_archived is not null then
      raise exception 'The seller profile is inactive.' using errcode = '42501';
    end if;
    if seller_action <> 'moderation' then
      select exists (
        select 1 from public.business_memberships m where m.business_id = parent_business_id and m.profile_id = requester_id
          and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
      ) into role_allowed;
      if not role_allowed then raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501'; end if;
    elsif not is_vetit_admin then
      raise exception 'Vetit administrator access is required.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then parent_id := old.listing_id; else parent_id := new.listing_id; end if;
  if tg_op = 'UPDATE' and (new.listing_id is distinct from old.listing_id) then
    raise exception 'A catalogue record cannot be moved to another listing.' using errcode = '42501';
  end if;

  -- Serialize child mutations against submit/moderation on the parent listing.
  select l.business_id into parent_business_id from public.listings l where l.id = parent_id;
  if not found then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  select b.is_active, b.archived_at into business_active, business_archived
  from public.businesses b where b.id = parent_business_id for share;
  if not found or not business_active or business_archived is not null then raise exception 'Seller profile is inactive.' using errcode = '42501'; end if;
  if seller_action = 'moderation' and is_vetit_admin and tg_table_name = 'listing_markets' then
    role_allowed := true;
  else
    select exists (
      select 1 from public.business_memberships m where m.business_id = parent_business_id and m.profile_id = requester_id
        and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    ) into role_allowed;
  end if;
  if not role_allowed then raise exception 'You do not have catalog access to this product.' using errcode = '42501'; end if;

  select l.moderation_status, l.archived_at into parent_status, parent_archived
  from public.listings l where l.id = parent_id for update;
  if not found or parent_archived is not null then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;
  -- Keep image-specific fields behind a table/op check: trigger records have
  -- different shapes, so referencing OLD.storage_object_path in the shared
  -- predicate can fail on unrelated child-table operations.
  if tg_table_name = 'listing_images' and tg_op = 'DELETE' and parent_status = 'submitted' then
    select not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'listing-images' and o.name = old.storage_object_path
    ) into allow_submitted_image_cleanup;
  end if;
  if parent_status not in ('draft', 'rejected')
     and not (tg_table_name = 'listing_markets' and seller_action = 'moderation' and is_vetit_admin and parent_status = 'submitted')
     and not allow_submitted_image_cleanup then
    raise exception 'Only draft or rejected products can be changed.' using errcode = '42501';
  end if;

  if tg_table_name = 'listing_images' then
    if tg_op = 'INSERT' then
      if not public.seller_image_path_is_canonical(new.storage_object_path, parent_business_id, parent_id) then
        raise exception 'Product image paths must use the canonical seller/listing/UUID path.' using errcode = '22023';
      end if;
      if new.visibility_status is distinct from 'visible' or length(coalesce(new.alt_text, '')) > 500 then
        raise exception 'Product photos must be visible catalogue images with a description under 500 characters.' using errcode = '22023';
      end if;
      select count(*) into image_count from public.listing_images li where li.listing_id = parent_id;
      if image_count >= 5 then raise exception 'A product can have at most five images.' using errcode = '22023'; end if;
      new.sort_order := coalesce((select max(li.sort_order) from public.listing_images li where li.listing_id = parent_id), -1) + 1;
    elsif tg_op = 'UPDATE' then
      if new.storage_object_path is distinct from old.storage_object_path then
        raise exception 'Product image object paths are immutable.' using errcode = '42501';
      end if;
      if new.visibility_status is distinct from old.visibility_status then
        raise exception 'Only Vetit moderation can change product image visibility.' using errcode = '42501';
      end if;
      if length(coalesce(new.alt_text, '')) > 500 then raise exception 'Image description is too long.' using errcode = '22023'; end if;
    end if;
  elsif seller_action <> 'save' and not (tg_table_name = 'listing_markets' and seller_action = 'moderation' and is_vetit_admin) then
    raise exception 'Catalogue records must be changed through the scoped seller operation.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_seller_catalog_mutations() from public, anon, authenticated;

drop trigger if exists guard_seller_business_verification on public.businesses;
drop trigger if exists guard_seller_listing_moderation on public.listings;
drop trigger if exists guard_seller_market_compliance on public.listing_markets;
drop trigger if exists guard_seller_listing_prices on public.listing_prices;
drop trigger if exists guard_seller_listing_species on public.listing_species;
drop trigger if exists guard_seller_listing_images on public.listing_images;
drop trigger if exists guard_seller_product_variants on public.product_variants;
create trigger guard_seller_business_verification before update on public.businesses for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_listing_moderation before insert or update on public.listings for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_market_compliance before insert or update or delete on public.listing_markets for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_listing_prices before insert or update or delete on public.listing_prices for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_listing_species before insert or update or delete on public.listing_species for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_listing_images before insert or update or delete on public.listing_images for each row execute function public.guard_seller_catalog_mutations();
create trigger guard_seller_product_variants before insert or update or delete on public.product_variants for each row execute function public.guard_seller_catalog_mutations();

-- The Data API cannot bypass the validated seller/admin RPCs with direct DML.
revoke insert, update, delete on public.businesses from public, anon, authenticated;
grant update (display_name, legal_name, public_email, public_phone, website_url) on public.businesses to authenticated;
revoke insert, update, delete on public.business_memberships from public, anon, authenticated;
revoke insert, update, delete on public.listings from public, anon, authenticated;
revoke insert, update, delete on public.listing_markets from public, anon, authenticated;
revoke insert, update, delete on public.listing_prices from public, anon, authenticated;
revoke insert, update, delete on public.listing_species from public, anon, authenticated;
revoke insert, update, delete on public.product_variants from public, anon, authenticated;
revoke insert, update, delete on public.listing_images from public, anon;
grant insert, update, delete on public.listing_images to authenticated;

-- Existing permissive member policies remain in place; these restrictive
-- policies constrain every authenticated write to the exact owned draft.
drop policy if exists "seller image insert boundary" on public.listing_images;
drop policy if exists "seller image update boundary" on public.listing_images;
drop policy if exists "seller image delete boundary" on public.listing_images;
create policy "seller image insert boundary" on public.listing_images as restrictive for insert to authenticated
with check (exists (
  select 1 from public.listings l join public.businesses b on b.id = l.business_id
  join public.business_memberships m on m.business_id = b.id
  where l.id = listing_images.listing_id and l.kind = 'product' and l.moderation_status in ('draft', 'rejected')
    and l.archived_at is null and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
    and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    and public.seller_image_path_is_canonical(listing_images.storage_object_path, b.id, l.id)
));
create policy "seller image update boundary" on public.listing_images as restrictive for update to authenticated
using (exists (
  select 1 from public.listings l join public.businesses b on b.id = l.business_id
  join public.business_memberships m on m.business_id = b.id
  where l.id = listing_images.listing_id and l.kind = 'product' and l.moderation_status in ('draft', 'rejected')
    and l.archived_at is null and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
    and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    and public.seller_image_path_is_canonical(listing_images.storage_object_path, b.id, l.id)
)) with check (exists (
  select 1 from public.listings l join public.businesses b on b.id = l.business_id
  join public.business_memberships m on m.business_id = b.id
  where l.id = listing_images.listing_id and l.kind = 'product' and l.moderation_status in ('draft', 'rejected')
    and l.archived_at is null and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
    and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    and public.seller_image_path_is_canonical(listing_images.storage_object_path, b.id, l.id)
));
create policy "seller image delete boundary" on public.listing_images as restrictive for delete to authenticated
using (exists (
  select 1 from public.listings l join public.businesses b on b.id = l.business_id
  join public.business_memberships m on m.business_id = b.id
  where l.id = listing_images.listing_id and l.kind = 'product' and l.moderation_status in ('draft', 'rejected')
    and l.archived_at is null and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
    and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
));

-- Never silently change an existing bucket. A mismatched bucket needs review.
do $$
declare existing_bucket record;
begin
  select b.public, b.file_size_limit, b.allowed_mime_types into existing_bucket
  from storage.buckets b where b.id = 'listing-images';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('listing-images', 'listing-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  elsif existing_bucket.public is distinct from false
     or existing_bucket.file_size_limit is distinct from 5242880
     or existing_bucket.allowed_mime_types is distinct from array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[] then
    raise exception 'Existing listing-images bucket settings differ; review them before applying seller image storage.';
  end if;
end;
$$;

drop policy if exists "seller and published listing image reads" on storage.objects;
drop policy if exists "seller uploads listing images" on storage.objects;
drop policy if exists "seller removes own listing images" on storage.objects;
create policy "seller and published listing image reads" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'listing-images'
  and exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    where li.storage_object_path = storage.objects.name and li.visibility_status = 'visible'
      and public.seller_image_path_is_canonical(storage.objects.name, b.id, l.id)
      and (
        (l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null
          and b.verification_status = 'verified' and b.is_active and b.archived_at is null)
        or exists (select 1 from public.business_memberships m where m.business_id = b.id
          and m.profile_id = (select auth.uid()) and m.membership_status = 'active')
      )
  )
);
create policy "seller uploads listing images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and cardinality(storage.foldername(name)) = 2
  and exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    join public.business_memberships m on m.business_id = b.id
    where li.storage_object_path = name and li.visibility_status = 'visible'
      and public.seller_image_path_is_canonical(name, b.id, l.id)
      and l.kind = 'product' and l.moderation_status in ('draft', 'rejected') and l.archived_at is null
      and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);
create policy "seller removes own listing images" on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-images'
  and cardinality(storage.foldername(name)) = 2
  and exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    join public.business_memberships m on m.business_id = b.id
    where li.storage_object_path = name
      and public.seller_image_path_is_canonical(name, b.id, l.id)
      and l.kind = 'product' and l.moderation_status in ('draft', 'rejected') and l.archived_at is null
      and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);

-- Restrictive guards prevent an unrelated permissive Storage policy from
-- widening access to this bucket. Other buckets retain their existing rules.
drop policy if exists "vetit listing image select boundary" on storage.objects;
drop policy if exists "vetit listing image insert boundary" on storage.objects;
drop policy if exists "vetit listing image update boundary" on storage.objects;
drop policy if exists "vetit listing image delete boundary" on storage.objects;
create policy "vetit listing image select boundary" on storage.objects as restrictive for select to anon, authenticated
using (
  bucket_id <> 'listing-images' or exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    where li.storage_object_path = storage.objects.name and li.visibility_status = 'visible'
      and public.seller_image_path_is_canonical(storage.objects.name, b.id, l.id)
      and (
        (l.kind = 'product' and l.moderation_status = 'published' and l.archived_at is null
          and b.verification_status = 'verified' and b.is_active and b.archived_at is null)
        or exists (select 1 from public.business_memberships m where m.business_id = b.id
          and m.profile_id = (select auth.uid()) and m.membership_status = 'active')
      )
  )
);
create policy "vetit listing image insert boundary" on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'listing-images' or exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    join public.business_memberships m on m.business_id = b.id
    where li.storage_object_path = name and li.visibility_status = 'visible'
      and public.seller_image_path_is_canonical(name, b.id, l.id)
      and l.kind = 'product' and l.moderation_status in ('draft', 'rejected') and l.archived_at is null
      and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);
create policy "vetit listing image update boundary" on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'listing-images')
with check (bucket_id <> 'listing-images');
create policy "vetit listing image delete boundary" on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'listing-images' or exists (
    select 1 from public.listing_images li
    join public.listings l on l.id = li.listing_id
    join public.businesses b on b.id = l.business_id
    join public.business_memberships m on m.business_id = b.id
    where li.storage_object_path = name
      and public.seller_image_path_is_canonical(name, b.id, l.id)
      and l.kind = 'product' and l.moderation_status in ('draft', 'rejected') and l.archived_at is null
      and b.is_active and b.archived_at is null and m.profile_id = (select auth.uid())
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);
