-- Supplemental Test candidate step 8. Read-only; no approval path or risk claims.
begin;
create or replace function public.admin_listing_queue(
  p_status text default 'submitted', p_kind text default null,
  p_market text default null, p_category uuid default null,
  p_before_created timestamptz default null, p_before_id uuid default null,
  p_limit integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $queue$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'vetit_admin','false') <> 'true' then
    raise exception 'Vetit administrator required.' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('draft','submitted','published','rejected')
     or (p_kind is not null and p_kind not in ('product','service'))
     or (p_market is not null and p_market !~ '^[A-Z]{2}$')
     or p_limit is null or p_limit < 1 or p_limit > 50
     or ((p_before_created is null) <> (p_before_id is null)) then
    raise exception 'Invalid queue filters.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
  from (
    select l.id,l.title,l.business_id,b.display_name as seller_name,
      l.category_id,l.kind,l.moderation_status,l.created_at,l.updated_at,
      b.verification_status as seller_verification,'not_assessed'::text as risk
    from public.listings l join public.businesses b on b.id=l.business_id
    where l.archived_at is null and b.archived_at is null
      and l.moderation_status=p_status
      and (p_kind is null or l.kind=p_kind)
      and (p_category is null or l.category_id=p_category)
      and (p_market is null or exists(select 1 from public.listing_markets m where m.listing_id=l.id and m.market_code=p_market))
      and (p_before_created is null or (l.created_at,l.id)<(p_before_created,p_before_id))
    order by l.created_at desc,l.id desc limit p_limit+1
  ) q;
  return jsonb_build_object('items', result - p_limit, 'hasMore',jsonb_array_length(result)>p_limit);
end;
$queue$;
revoke all on function public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer) to authenticated;
commit;
