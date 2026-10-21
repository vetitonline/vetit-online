-- LOCAL REVIEW: monotonic price versions after parent locking; same RPC signatures and grants.
-- Submit checks wall clock after same-transaction saves. No schema/role changes.
-- LOCAL REVIEW PROPOSAL. Existing Test foundation only; no history rewrite.
-- Full function copied from seller hardening; only the object-key count changes.
-- JSON object type is checked before key enumeration.
begin;
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
  price_effective_at timestamptz;
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
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(item->'option_attributes')) <> 1 then
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
  -- Parent listing lock serializes saves; advance beyond every retained price version.
  select greatest(pg_catalog.clock_timestamp(), coalesce(max(p.valid_from) + interval '1 microsecond', '-infinity'::timestamptz))
    into price_effective_at from public.listing_prices p where p.listing_id = saved_listing_id;
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

  -- Parent listing lock serializes saves; advance beyond every retained price version.
  select greatest(pg_catalog.clock_timestamp(), coalesce(max(p.valid_from) + interval '1 microsecond', '-infinity'::timestamptz))
    into price_effective_at from public.listing_prices p where p.listing_id = saved_listing_id;
  if jsonb_array_length(normalized_variants) = 0 then
    update public.product_variants set active_status = false, updated_at = now()
    where listing_id = saved_listing_id and active_status;
    update public.listing_prices set status = 'inactive', valid_to = price_effective_at
    where listing_id = saved_listing_id and status = 'active';
    insert into public.listing_prices (listing_id, market_code, product_variant_id, currency_code, amount_minor, status, valid_from)
    values (saved_listing_id, 'IN', null, market_currency, p_base_amount_minor, 'active', price_effective_at);
  else
    update public.product_variants v set active_status = false, updated_at = now()
    where v.listing_id = saved_listing_id and v.active_status
      and upper(regexp_replace(trim(v.seller_sku), '[[:space:]]+', '-', 'g')) <> all(normalized_skus);
    update public.listing_prices p set status = 'inactive', valid_to = price_effective_at
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
      update public.listing_prices set status = 'inactive', valid_to = price_effective_at
      where listing_id = saved_listing_id and product_variant_id = variant_id and status = 'active';
      insert into public.listing_prices (listing_id, market_code, product_variant_id, currency_code, amount_minor, status, valid_from)
      values (saved_listing_id, 'IN', variant_id, market_currency, variant_amount, 'active', price_effective_at);
    end loop;
  end if;
  return saved_listing_id;
end;
$$;
revoke all on function public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) from public,anon;
grant execute on function public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) to authenticated;
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
        and p.valid_from <= pg_catalog.clock_timestamp() and (p.valid_to is null or p.valid_to > pg_catalog.clock_timestamp())) <> 1 then
      raise exception 'Exactly one effective positive INR product price is required.' using errcode = '22023';
    end if;
  else
    if exists (
      select 1 from public.product_variants v
      where v.listing_id = p_listing_id and v.active_status and not exists (
        select 1 from public.listing_prices p
        where p.listing_id = p_listing_id and p.product_variant_id = v.id and p.market_code = 'IN'
          and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= pg_catalog.clock_timestamp() and (p.valid_to is null or p.valid_to > pg_catalog.clock_timestamp())
      )
      ) or exists (
      select 1 from public.listing_prices p
      where p.listing_id = p_listing_id and p.product_variant_id is null and p.market_code = 'IN'
        and p.currency_code = 'INR' and p.status = 'active' and p.valid_from <= pg_catalog.clock_timestamp()
        and (p.valid_to is null or p.valid_to > pg_catalog.clock_timestamp())
    ) then raise exception 'Every active product variant requires an effective INR price.' using errcode = '22023'; end if;
    if exists (
      select 1 from public.product_variants v where v.listing_id = p_listing_id and v.active_status
        and (select count(*) from public.listing_prices p where p.listing_id = p_listing_id and p.product_variant_id = v.id
          and p.market_code = 'IN' and p.currency_code = 'INR' and p.status = 'active' and p.amount_minor > 0
          and p.valid_from <= pg_catalog.clock_timestamp() and (p.valid_to is null or p.valid_to > pg_catalog.clock_timestamp())) <> 1
    ) then raise exception 'Each active variant must have exactly one effective INR price.' using errcode = '22023'; end if;
  end if;

  perform set_config('vetit.seller_action', 'submit', true);
  update public.listings l set moderation_status = 'submitted', moderated_by = null, moderated_at = null, updated_at = now()
  where l.id = p_listing_id;
  return p_listing_id;
end;
$$;
commit;
