-- Step 11: retain restrictive boundaries; extend exact reserved service paths.
begin;
-- Inline membership subqueries in the old SELECT policies require anon table
-- privileges. Keep membership private by evaluating exact read rules here.
create or replace function public.can_read_moderated_listing_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id
 where i.storage_object_path=p_path and i.visibility_status='visible' and public.seller_image_path_is_canonical(p_path,b.id,l.id) and (
 (auth.uid() is not null and exists(select 1 from public.business_memberships m where m.business_id=b.id and m.profile_id=auth.uid() and m.membership_status='active'))
 or (l.kind='service' and l.archived_at is null and b.archived_at is null and vetit_moderation.is_admin())
 or (l.moderation_status='published' and l.archived_at is null and b.is_active and b.archived_at is null and b.verification_status='verified' and exists(select 1 from public.listing_markets lm join public.markets mk on mk.country_code=lm.market_code where lm.listing_id=l.id and lm.availability_status='available' and lm.compliance_status='approved' and mk.market_status='active' and (l.kind='product' or lm.market_code='IN')))
 ));$$;
revoke all on function public.can_read_moderated_listing_image(text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_moderated_listing_image(text) to anon,authenticated;
alter policy "seller and published listing image reads" on storage.objects using(bucket_id='listing-images' and public.can_read_moderated_listing_image(name));
alter policy "vetit listing image select boundary" on storage.objects using(bucket_id<>'listing-images' or public.can_read_moderated_listing_image(name));
alter policy "vetit listing image insert boundary" on storage.objects with check (
(
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
  ))
or (bucket_id='listing-images' and public.can_write_service_image(name) and exists(select 1 from public.listing_images i where i.storage_object_path=storage.objects.name and i.visibility_status='visible'))
);
alter policy "vetit listing image delete boundary" on storage.objects using (
(
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
  ))
or (bucket_id='listing-images' and public.can_write_service_image(name))
);
-- The restrictive UPDATE policy is unchanged: listing-images overwrite denied.
commit;
