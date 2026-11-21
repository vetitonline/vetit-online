-- Proposal only. Apply solely to the disposable test project until deployment approval.
begin;
create function public.get_admin_order_overview(p_limit integer default 21, p_before_created_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'vetit_admin','false') <> 'true' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51 or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Invalid order page' using errcode = '22023';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]'::jsonb) from (
    select id,market_code,order_status,currency_code,subtotal_minor,delivery_minor,tax_minor,total_minor,created_at
    from public.orders where p_before_created_at is null or (created_at,id)<(p_before_created_at,p_before_id)
    order by created_at desc,id desc limit p_limit
  ) r);
end;
$$;
revoke all on function public.get_admin_order_overview(integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_admin_order_overview(integer,timestamptz,uuid) to authenticated;
comment on function public.get_admin_order_overview(integer,timestamptz,uuid) is 'Read-only trusted-admin order summaries. No customer identity, address or payment evidence.';
commit;
