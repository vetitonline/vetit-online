-- Forward-only local proposal, not applied to hosted Supabase.
-- For authenticated pre-existing accounts whose signup predates the profile trigger.
begin;
create or replace function public.ensure_my_profile()
returns uuid language plpgsql security definer set search_path='' as $$
declare requester uuid:=auth.uid(); account record;
begin
 if requester is null then raise exception 'Authentication required' using errcode='42501';end if;
 select u.id,u.phone,u.raw_user_meta_data into account from auth.users u where u.id=requester;
 if not found then raise exception 'Authenticated account unavailable' using errcode='42501';end if;
 -- Role defaults to customer. User-controlled metadata never grants permissions.
 insert into public.profiles(id,full_name,phone)
 values(requester,case when jsonb_typeof(account.raw_user_meta_data->'full_name')='string'
   then nullif(left(trim(account.raw_user_meta_data->>'full_name'),160),'') else null end,account.phone)
 on conflict(id) do nothing;
 return requester;
end;$$;
revoke all on function public.ensure_my_profile() from public,anon,authenticated,service_role;
grant execute on function public.ensure_my_profile() to authenticated;
commit;
