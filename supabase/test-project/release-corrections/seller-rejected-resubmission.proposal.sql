-- SUPPLEMENTAL LOCAL PROPOSAL ONLY; not included in the six-file RC1 manifest.
-- Source-confirmed resubmission conflict. Requires separate version/review/approval.
-- Definition replacement is idempotent; all other original guard logic is retained.
begin;
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
        -- Only the scoped, authorized resubmission transition may clear old review metadata.
        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected')
           and new.moderation_status = 'submitted'
           and new.moderated_by is null and new.moderated_at is null then
          null;
        elsif not is_vetit_admin or seller_action <> 'moderation' then
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
commit;
