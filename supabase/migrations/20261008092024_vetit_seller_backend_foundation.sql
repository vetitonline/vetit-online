-- Review-only seller foundation for the existing Vetit schema.
-- This migration is intentionally NOT applied to the live project by this task.
-- It uses existing tables, RLS ownership, moderation fields and the IN/INR market.

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
  new_business_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication is required to create a seller profile.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 or length(trim(p_display_name)) > 120 or length(coalesce(trim(p_legal_name), '')) > 180 then
    raise exception 'Enter a business name between 2 and 120 characters.' using errcode = '22023';
  end if;
  if p_business_type not in ('individual', 'company', 'farm', 'other') then
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
  -- Serialize onboarding retries per profile and return its existing owner business.
  perform p.id from public.profiles p where p.id = requester_id for update;
  if not found then
    raise exception 'The signed-in profile is not ready yet.' using errcode = '23503';
  end if;

  select m.business_id into new_business_id
  from public.business_memberships m
  where m.profile_id = requester_id
    and m.member_role = 'owner'
    and m.membership_status = 'active'
  order by m.created_at, m.business_id
  limit 1;
  if found then
    return new_business_id;
  end if;

  insert into public.businesses (display_name, legal_name, business_type, public_email, public_phone, website_url, country_code)
  values (trim(p_display_name), nullif(trim(p_legal_name), ''), p_business_type, nullif(trim(p_public_email), ''), nullif(trim(p_public_phone), ''), nullif(trim(p_website_url), ''), 'IN')
  returning id into new_business_id;

  insert into public.business_memberships (business_id, profile_id, member_role, membership_status)
  values (new_business_id, requester_id, 'owner', 'active');

  return new_business_id;
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
  item jsonb;
  variant_id uuid;
  variant_sku text;
  variant_name text;
  variant_value text;
  variant_amount bigint;
begin
  if requester_id is null then
    raise exception 'Authentication is required to manage seller products.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.profile_id = requester_id
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.is_active and b.archived_at is null
  ) then
    raise exception 'This seller profile is inactive.' using errcode = '42501';
  end if;
  if nullif(trim(p_title), '') is null or length(trim(p_title)) > 160
     or nullif(trim(p_slug), '') is null or length(trim(p_slug)) > 100
     or length(coalesce(p_description, '')) > 5000 then
    raise exception 'Product details are incomplete or too long.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.kind in ('product', 'both') and c.moderation_status = 'active'
  ) then
    raise exception 'Choose an active Vetit product category.' using errcode = '22023';
  end if;
  if p_species_ids is null or cardinality(p_species_ids) < 1 or cardinality(p_species_ids) > 8
     or exists (select 1 from unnest(p_species_ids) s(id) left join public.animal_species a on a.id = s.id where a.id is null or not a.is_active) then
    raise exception 'Choose between 1 and 8 active pets or livestock types.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_species_ids) s(id)
    where exists (select 1 from public.category_species cs where cs.category_id = p_category_id)
      and not exists (select 1 from public.category_species cs where cs.category_id = p_category_id and cs.species_id = s.id)
  ) then
    raise exception 'The selected category is not available for one of these species.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) > 20 then
    raise exception 'A product can have at most 20 variants.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) > 0 and (
    select count(distinct item->>'seller_sku') <> jsonb_array_length(p_variants)
    from jsonb_array_elements(p_variants) item
  ) then
    raise exception 'Variant SKUs must be unique for this product.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) = 0 then
    if p_base_amount_minor is null or p_base_amount_minor < 1 or p_base_amount_minor > 9999999900 then
      raise exception 'Enter a valid INR price.' using errcode = '22023';
    end if;
  elsif p_base_amount_minor is not null then
    raise exception 'Use either a base price or variant prices.' using errcode = '22023';
  end if;
  select m.currency_code into market_currency from public.markets m
  where m.country_code = 'IN' and m.market_status = 'active';
  if market_currency is distinct from 'INR' then
    raise exception 'The India market is not available for seller prices.' using errcode = '22023';
  end if;

  if p_listing_id is null then
    insert into public.listings (business_id, kind, category_id, title, slug, description)
    values (p_business_id, 'product', p_category_id, trim(p_title), trim(p_slug), coalesce(trim(p_description), ''))
    returning id into saved_listing_id;
  else
    select l.* into current_listing from public.listings l
    where l.id = p_listing_id and l.business_id = p_business_id for update;
    if not found or current_listing.moderation_status not in ('draft', 'rejected') then
      raise exception 'Only your draft or rejected product listings can be edited.' using errcode = '42501';
    end if;
    update public.listings l set category_id = p_category_id, title = trim(p_title), slug = trim(p_slug),
      description = coalesce(trim(p_description), ''), updated_at = now()
    where l.id = p_listing_id returning l.id into saved_listing_id;
  end if;

  delete from public.listing_species where listing_id = saved_listing_id;
  insert into public.listing_species (listing_id, species_id)
  select saved_listing_id, s.id from unnest(p_species_ids) s(id);

  insert into public.listing_markets (listing_id, market_code, availability_status, compliance_status)
  values (saved_listing_id, 'IN', 'available', 'pending')
  on conflict (listing_id, market_code) do update set availability_status = 'available';

  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) = 0 then
    update public.product_variants set active_status = false, updated_at = now() where listing_id = saved_listing_id and active_status;
    update public.listing_prices set status = 'inactive', valid_to = now()
      where listing_id = saved_listing_id and product_variant_id is null and status = 'active';
    insert into public.listing_prices (listing_id, market_code, currency_code, amount_minor, status)
    values (saved_listing_id, 'IN', market_currency, p_base_amount_minor, 'active');
  else
    update public.listing_prices set status = 'inactive', valid_to = now()
      where listing_id = saved_listing_id and product_variant_id is null and status = 'active';
    update public.product_variants v set active_status = false, updated_at = now()
      where v.listing_id = saved_listing_id and not exists (
        select 1 from jsonb_array_elements(p_variants) candidate
        where candidate->>'seller_sku' = v.seller_sku
      );
    for item in select value from jsonb_array_elements(p_variants)
    loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'option_attributes') <> 'object' then
        raise exception 'Variant options must be a single named option.' using errcode = '22023';
      end if;
      if jsonb_object_length(item->'option_attributes') <> 1 then
        raise exception 'Each variant must contain one option name and value.' using errcode = '22023';
      end if;
      variant_sku := trim(coalesce(item->>'seller_sku', ''));
      select entry.key, entry.value #>> '{}'
      into variant_name, variant_value
      from jsonb_each(coalesce(item->'option_attributes', '{}'::jsonb)) entry
      limit 1;
      variant_name := trim(coalesce(variant_name, ''));
      variant_value := trim(coalesce(variant_value, ''));
      variant_amount := nullif(item->>'amount_minor', '')::bigint;
      if variant_sku = '' or length(variant_sku) > 80 or variant_name = '' or length(variant_name) > 60
         or variant_value = '' or length(variant_value) > 120 or variant_amount is null
         or variant_amount < 1 or variant_amount > 9999999900 then
        raise exception 'A variant is missing a valid SKU, option or INR price.' using errcode = '22023';
      end if;
      insert into public.product_variants (listing_id, seller_sku, option_attributes, active_status)
      values (saved_listing_id, variant_sku, item->'option_attributes', true)
      on conflict (listing_id, seller_sku) do update set option_attributes = excluded.option_attributes, active_status = true, updated_at = now()
      returning id into variant_id;
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
begin
  if requester_id is null then
    raise exception 'Authentication is required to submit a product.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.profile_id = requester_id
      and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'You do not have catalog access to this seller profile.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.is_active and b.archived_at is null
  ) then
    raise exception 'This seller profile is inactive.' using errcode = '42501';
  end if;
  update public.listings l set moderation_status = 'submitted', updated_at = now()
  where l.id = p_listing_id and l.business_id = p_business_id and l.moderation_status in ('draft', 'rejected')
    and exists (select 1 from public.listing_prices p where p.listing_id = l.id and p.market_code = 'IN' and p.status = 'active' and p.amount_minor > 0)
    and exists (select 1 from public.listing_species s where s.listing_id = l.id)
    and exists (select 1 from public.listing_markets m where m.listing_id = l.id and m.market_code = 'IN' and m.availability_status = 'available');
  if not found then
    raise exception 'Complete the product details, pet or livestock selection, and INR price before submitting.' using errcode = '22023';
  end if;
  return p_listing_id;
end;
$$;
revoke all on function public.submit_seller_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_seller_product(uuid, uuid) to authenticated;

-- Existing row-level policies authorize business edits, but these checks ensure
-- membership alone can never verify a business or publish/moderate a listing.
create or replace function public.guard_seller_moderation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_vetit_admin boolean := coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false);
  parent_listing_id uuid;
  parent_listing_status text;
begin
  if tg_table_name = 'businesses' then
    if not is_vetit_admin and (
      new.verification_status is distinct from old.verification_status
      or new.is_active is distinct from old.is_active
    ) then
      raise exception 'Only Vetit administrators can change business verification.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'listings' then
    if not is_vetit_admin then
      if tg_op = 'INSERT' then
        if new.moderation_status not in ('draft', 'submitted') or new.moderated_by is not null or new.moderated_at is not null then
          raise exception 'Only Vetit administrators can publish or moderate seller listings.' using errcode = '42501';
        end if;
      elsif (
        new.moderated_by is distinct from old.moderated_by
        or new.moderated_at is distinct from old.moderated_at
        or (new.moderation_status is distinct from old.moderation_status and new.moderation_status not in ('draft', 'submitted'))
        or (old.moderation_status in ('submitted', 'published') and (
          new.category_id is distinct from old.category_id
          or new.title is distinct from old.title
          or new.slug is distinct from old.slug
          or new.description is distinct from old.description
        ) and not (new.moderation_status = 'draft' or (old.moderation_status = 'published' and new.moderation_status = 'submitted')))
      ) then
        raise exception 'Only Vetit administrators can publish or moderate seller listings.' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'listing_markets' then
    if not is_vetit_admin and (
      (tg_op = 'INSERT' and new.compliance_status <> 'pending')
      or (tg_op = 'UPDATE' and new.compliance_status is distinct from old.compliance_status)
    ) then
      raise exception 'Only Vetit administrators can change listing market compliance.' using errcode = '42501';
    end if;
  end if;
  if tg_table_name in ('listing_markets', 'listing_prices', 'listing_species', 'listing_images', 'product_variants') and not is_vetit_admin then
    if tg_op = 'DELETE' then
      parent_listing_id := old.listing_id;
    else
      parent_listing_id := new.listing_id;
    end if;
    if not exists (
      select 1 from public.business_memberships m
      join public.listings l on l.business_id = m.business_id
      where l.id = parent_listing_id and m.profile_id = auth.uid()
        and m.membership_status = 'active' and m.member_role in ('owner', 'admin', 'catalog_manager')
    ) then
      raise exception 'You do not have catalog access to this product.' using errcode = '42501';
    end if;
    select l.moderation_status into parent_listing_status from public.listings l where l.id = parent_listing_id;
    if parent_listing_status in ('submitted', 'published') then
      raise exception 'Move this product back to draft before changing its catalogue data.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_seller_moderation_fields() from public, anon, authenticated;

create trigger guard_seller_business_verification
before update on public.businesses
for each row execute function public.guard_seller_moderation_fields();
create trigger guard_seller_listing_moderation
before insert or update on public.listings
for each row execute function public.guard_seller_moderation_fields();
create trigger guard_seller_market_compliance
before insert or update or delete on public.listing_markets
for each row execute function public.guard_seller_moderation_fields();

create trigger guard_seller_listing_prices
before insert or update or delete on public.listing_prices
for each row execute function public.guard_seller_moderation_fields();
create trigger guard_seller_listing_species
before insert or update or delete on public.listing_species
for each row execute function public.guard_seller_moderation_fields();
create trigger guard_seller_listing_images
before insert or update or delete on public.listing_images
for each row execute function public.guard_seller_moderation_fields();
create trigger guard_seller_product_variants
before insert or update or delete on public.product_variants
for each row execute function public.guard_seller_moderation_fields();

-- Private media bucket: public catalogue pages obtain short-lived signed URLs
-- through the SELECT policy below; draft media is visible only to its members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy "seller and published listing image reads"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'listing-images' and (
    exists (
      select 1 from public.listings l
      join public.listing_images li on li.listing_id = l.id
      join public.businesses b on b.id = l.business_id
      where li.storage_object_path = storage.objects.name
        and li.visibility_status = 'visible'
        and l.moderation_status = 'published'
        and b.verification_status = 'verified' and b.is_active
    )
    or exists (
      select 1 from public.listings l
      join public.business_memberships m on m.business_id = l.business_id
      where l.id::text = split_part(storage.objects.name, '/', 2)
        and l.business_id::text = split_part(storage.objects.name, '/', 1)
        and m.profile_id = auth.uid() and m.membership_status = 'active'
    )
  )
);

create policy "seller uploads listing images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and cardinality(storage.foldername(name)) = 2
  and exists (
    select 1 from public.listings l
    join public.business_memberships m on m.business_id = l.business_id
    where l.id::text = split_part(name, '/', 2)
      and l.business_id::text = split_part(name, '/', 1)
      and l.moderation_status in ('draft', 'rejected')
      and m.profile_id = auth.uid() and m.membership_status = 'active'
      and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);

create policy "seller removes own listing images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-images'
  and cardinality(storage.foldername(name)) = 2
  and exists (
    select 1 from public.listings l
    join public.business_memberships m on m.business_id = l.business_id
    where l.id::text = split_part(name, '/', 2)
      and l.business_id::text = split_part(name, '/', 1)
      and l.moderation_status in ('draft', 'rejected')
      and m.profile_id = auth.uid() and m.membership_status = 'active'
      and m.member_role in ('owner', 'admin', 'catalog_manager')
  )
);
