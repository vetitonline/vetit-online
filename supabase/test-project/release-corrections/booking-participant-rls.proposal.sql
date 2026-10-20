-- LOCAL REVIEW PROPOSAL. Narrow reads before new booking data is introduced.
-- This matches the lifecycle proposal and can be applied independently first.
begin;
alter policy bookings_read_participant on public.bookings to authenticated using (
  customer_profile_id = (select auth.uid()) or exists (
    select 1 from public.business_memberships m where m.business_id = provider_business_id
      and m.profile_id = (select auth.uid()) and m.member_role in ('owner','admin')
      and m.membership_status = 'active'
  )
);
commit;
