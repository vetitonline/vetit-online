-- Forward-only development candidate. NOT hosted-applied.
-- Requires the recovered marketplace schema and its reviewed public SELECT RLS.
-- Read-only SECURITY INVOKER: no policy replacement, table grants or privileged client.
begin;

do $prerequisites$
declare relation_name text; caller_name text;
begin
  foreach relation_name in array array['listings','categories','businesses','markets',
    'listing_markets','listing_species','animal_species','category_species',
    'listing_prices','product_variants','listing_images'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation_name and c.relrowsecurity) then
      raise exception 'Public catalogue requires existing RLS on public.%', relation_name;
    end if;
    foreach caller_name in array array['anon','authenticated'] loop
      if not has_table_privilege(caller_name,format('public.%I',relation_name),'SELECT') then
        raise exception 'Reviewed public SELECT grant missing for % on %',caller_name,relation_name;
      end if;
    end loop;
  end loop;
end;
$prerequisites$;

create index if not exists listings_catalogue_newest_idx on public.listings(created_at desc,id)
  where kind='product' and moderation_status='published' and archived_at is null;
create index if not exists listings_catalogue_category_newest_idx on public.listings(category_id,created_at desc,id)
  where kind='product' and moderation_status='published' and archived_at is null;

create or replace function public.read_public_catalogue_page(
  p_query text default '', p_category_ids uuid[] default null, p_species_id uuid default null,
  p_min_minor bigint default null, p_max_minor bigint default null,
  p_sort text default 'newest', p_page integer default 1, p_page_size integer default 24,
  p_product text default null
) returns jsonb language plpgsql stable security invoker
set search_path='' set row_security=on as $function$
declare answer jsonb;
begin
  if p_page is null or p_page<1 or p_page>10000 or p_page_size is null or p_page_size<1 or p_page_size>48
    or p_sort is null or p_sort not in ('newest','price-asc','price-desc','name')
    or p_query is null or char_length(p_query)>100
    or p_min_minor<0 or p_max_minor<0 or p_min_minor>9007199254740991 or p_max_minor>9007199254740991
    or p_min_minor>p_max_minor
    or (p_product is not null and p_product !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9][a-z0-9-]{0,149})$') then
    raise exception using errcode='22023',message='Invalid catalogue filters';
  end if;

  -- One statement/snapshot for eligibility, exact count, clamped page and data.
  -- Only the selected <=48 rows acquire species arrays and an image path.
  with eligible as materialized (
    select l.id,l.slug,l.title,coalesce(l.description,'') as description,l.created_at,l.category_id,
      c.name as category,c.slug as category_slug,b.display_name as seller_name,m.currency_code,
      price.amount_minor,coalesce(price.is_variant,false) as price_is_from
    from public.listings l
    join public.categories c on c.id=l.category_id and c.kind in ('product','both') and c.moderation_status='active'
    join public.businesses b on b.id=l.business_id and b.is_active and b.archived_at is null and b.verification_status='verified'
    join public.listing_markets lm on lm.listing_id=l.id and lm.market_code='IN'
      and lm.availability_status='available' and lm.compliance_status='approved'
    join public.markets m on m.country_code=lm.market_code and m.market_status='active'
    left join lateral (
      -- Latest effective base wins; otherwise the cheapest latest active-variant price.
      select current_price.amount_minor,current_price.product_variant_id is not null as is_variant
      from (
        select distinct on (lp.product_variant_id) lp.product_variant_id,lp.amount_minor,lp.valid_from,lp.id
        from public.listing_prices lp
        where lp.listing_id=l.id and lp.market_code='IN' and lp.currency_code=m.currency_code
          and lp.status='active' and lp.valid_from<=statement_timestamp()
          and (lp.valid_to is null or lp.valid_to>statement_timestamp())
          and (lp.product_variant_id is null or exists (select 1 from public.product_variants pv
            where pv.id=lp.product_variant_id and pv.listing_id=l.id and pv.active_status))
        order by lp.product_variant_id,lp.valid_from desc,lp.id
      ) current_price
      order by (current_price.product_variant_id is not null),current_price.amount_minor,current_price.id
      limit 1
    ) price on true
    where l.kind='product' and l.moderation_status='published' and l.archived_at is null
      and (p_category_ids is null or l.category_id=any(p_category_ids))
      and (p_product is null or l.slug=p_product or l.id=case
        when p_product ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_product::uuid end)
      and (p_species_id is null or exists (select 1 from public.listing_species ls
        join public.animal_species a on a.id=ls.species_id and a.is_active
        where ls.listing_id=l.id and ls.species_id=p_species_id)
        or (not exists (select 1 from public.listing_species ls
            join public.animal_species a on a.id=ls.species_id and a.is_active where ls.listing_id=l.id)
          and exists (select 1 from public.category_species cs
            join public.animal_species a on a.id=cs.species_id and a.is_active
            where cs.category_id=l.category_id and cs.species_id=p_species_id)))
      and (p_min_minor is null or price.amount_minor>=p_min_minor)
      and (p_max_minor is null or price.amount_minor<=p_max_minor)
      -- Literal substring semantics, including %, _ and regional scripts; no dynamic SQL.
      and (p_query='' or strpos(lower(l.title||' '||coalesce(l.description,'')||' '||c.name||' '||b.display_name),lower(p_query))>0)
  ), totals as (
    select count(*) as total,greatest(1,(count(*)+p_page_size-1)/p_page_size)::integer as page_count from eligible
  ), bounds as (
    select total,page_count,least(p_page,page_count) as page from totals
  ), chosen as (
    select e.*,row_number() over (order by
      case when p_sort='price-asc' then amount_minor end asc nulls last,
      case when p_sort='price-desc' then amount_minor end desc nulls last,
      case when p_sort='name' then lower(title) end collate "C" asc,
      case when p_sort='newest' then created_at end desc,id asc) as ordinal
    from eligible e
    order by ordinal
    limit p_page_size offset (select (page-1)::bigint*p_page_size from bounds)
  )
  select jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'slug',p.slug,'title',p.title,'description',p.description,'category',p.category,
      'categorySlug',p.category_slug,'categoryId',p.category_id,'sellerName',p.seller_name,
      'brand',null,'priceMinor',p.amount_minor,'priceIsFrom',p.price_is_from,'currencyCode',p.currency_code,
      'species',coalesce(nullif(array(select a.slug from public.listing_species ls
          join public.animal_species a on a.id=ls.species_id and a.is_active where ls.listing_id=p.id order by a.slug),array[]::text[]),
        array(select a.slug from public.category_species cs join public.animal_species a on a.id=cs.species_id and a.is_active
          where cs.category_id=p.category_id order by a.slug)),
      'imagePath',photo.storage_object_path,'imageAlt',photo.alt_text) order by p.ordinal)
    from chosen p left join lateral (select i.storage_object_path,i.alt_text from public.listing_images i
      where i.listing_id=p.id and i.visibility_status='visible' order by i.sort_order,i.id limit 1) photo on true),'[]'::jsonb),
    'pagination',jsonb_build_object('page',page,'pageSize',p_page_size,'total',total,'pageCount',page_count,
      'hasPrevious',page>1,'hasNext',page<page_count,'truncated',false)) into answer from bounds;
  return answer;
end;
$function$;

revoke all on function public.read_public_catalogue_page(text,uuid[],uuid,bigint,bigint,text,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_public_catalogue_page(text,uuid[],uuid,bigint,bigint,text,integer,integer,text)
  to anon,authenticated;
comment on function public.read_public_catalogue_page(text,uuid[],uuid,bigint,bigint,text,integer,integer,text)
  is 'Public, RLS-preserving IN catalogue page; exact count, <=48 rows, stable sort and no Storage signing';
commit;
