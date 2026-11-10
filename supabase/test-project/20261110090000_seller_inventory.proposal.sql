-- Additive Test-only review proposal, not an automatic/production migration.
-- Apply only after reviewed commerce and atomic-checkout prerequisites/approval.
begin;
do $$ begin
  if to_regprocedure('public.set_seller_inventory(uuid,uuid,integer,text)') is null then
    raise exception 'Reviewed commerce inventory prerequisite required.';
  end if;
end $$;

create function public.get_my_seller_inventory()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); businesses jsonb; variants jsonb; ids uuid[];
begin
  if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select array_agg(b.id order by b.id) into ids from public.businesses b join public.business_memberships m on m.business_id=b.id
    where m.profile_id=actor and m.membership_status='active' and m.member_role in ('owner','admin','fulfillment_manager') and b.is_active and b.archived_at is null;
  if coalesce(cardinality(ids),0)>100 then raise exception 'Inventory pagination required.' using errcode='22023'; end if;
  if (select count(*) from public.product_variants v join public.listings l on l.id=v.listing_id
      where l.business_id=any(ids) and l.kind='product' and l.archived_at is null and v.active_status)>1000 then
    raise exception 'Inventory pagination required.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by id),'[]') into businesses from public.businesses where id=any(ids);
  select coalesce(jsonb_agg(jsonb_build_object('variantId',v.id,'listingId',l.id,'businessId',l.business_id,'title',l.title,
    'sku',v.seller_sku,'attributes',v.option_attributes,'inventoryId',i.id,'quantityOnHand',i.quantity_on_hand,
    'quantityReserved',i.quantity_reserved,'updatedAt',i.updated_at) order by l.id,v.id),'[]') into variants
    from public.product_variants v join public.listings l on l.id=v.listing_id
    left join public.inventory_levels i on i.product_variant_id=v.id and i.business_id=l.business_id and i.stock_location is null
    where l.business_id=any(ids) and l.kind='product' and l.archived_at is null and v.active_status;
  return jsonb_build_object('businesses',businesses,'variants',variants);
end $$;

-- Optimistic guard around the existing reservation-aware write. No location inference.
create function public.set_seller_inventory_checked(p_business_id uuid,p_product_variant_id uuid,p_quantity_on_hand integer,
  p_expected_inventory_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inventory public.inventory_levels%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  perform 1 from public.businesses b join public.business_memberships m on m.business_id=b.id
    where b.id=p_business_id and b.is_active and b.archived_at is null and m.profile_id=auth.uid()
      and m.membership_status='active' and m.member_role in ('owner','admin','fulfillment_manager') for share of b,m;
  if not found then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  perform 1 from public.product_variants v join public.listings l on l.id=v.listing_id
    where v.id=p_product_variant_id and v.active_status and l.business_id=p_business_id and l.kind='product' and l.archived_at is null for share of v,l;
  if not found then raise exception 'Product option unavailable.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('seller-stock:'||p_business_id::text||':'||p_product_variant_id::text,0));
  select * into inventory from public.inventory_levels where business_id=p_business_id and product_variant_id=p_product_variant_id and stock_location is null for update;
  if found then
    if inventory.id is distinct from p_expected_inventory_id or inventory.updated_at is distinct from p_expected_updated_at then
      raise exception 'Stock changed. Reload before editing.' using errcode='40001';
    end if;
  elsif p_expected_inventory_id is not null or p_expected_updated_at is not null then
    raise exception 'Stock changed. Reload before editing.' using errcode='40001';
  end if;
  return public.set_seller_inventory(p_business_id,p_product_variant_id,p_quantity_on_hand,null);
end $$;

-- Public purchase limit only: no SKU, seller-private totals, reservations or warehouse data.
-- This is an advisory read; place_my_order remains the atomic authority.
create function public.get_product_stock(p_variant_ids uuid[])
returns table(variant_id uuid,max_quantity integer) language plpgsql stable security definer set search_path = '' as $$
begin
  if p_variant_ids is null or cardinality(p_variant_ids)>1000 then raise exception 'Invalid option count.' using errcode='22023'; end if;
  return query select v.id,case when i.id is null then null else least(99,greatest(0,i.quantity_on_hand-i.quantity_reserved)) end
    from public.product_variants v join public.listings l on l.id=v.listing_id
    join public.businesses b on b.id=l.business_id join public.categories c on c.id=l.category_id
    join public.listing_markets lm on lm.listing_id=l.id and lm.market_code='IN'
    join public.markets m on m.country_code='IN'
    left join public.inventory_levels i on i.product_variant_id=v.id and i.business_id=b.id and i.stock_location is null
    where v.id=any(p_variant_ids) and v.active_status and l.kind='product' and l.moderation_status='published' and l.archived_at is null
      and b.is_active and b.archived_at is null and b.verification_status='verified' and c.kind in ('product','both') and c.moderation_status='active'
      and lm.availability_status='available' and lm.compliance_status='approved' and m.market_status='active' and m.currency_code='INR'
      and exists(select 1 from public.listing_prices p where p.listing_id=l.id and p.product_variant_id=v.id and p.market_code='IN' and p.currency_code='INR'
        and p.status='active' and p.valid_from<=statement_timestamp() and (p.valid_to is null or p.valid_to>statement_timestamp()));
end $$;
revoke all on function public.get_my_seller_inventory(),public.set_seller_inventory_checked(uuid,uuid,integer,uuid,timestamptz),public.get_product_stock(uuid[]) from public,anon,authenticated;
grant execute on function public.get_my_seller_inventory(),public.set_seller_inventory_checked(uuid,uuid,integer,uuid,timestamptz) to authenticated;
grant execute on function public.get_product_stock(uuid[]) to anon,authenticated;
commit;
