-- UNAPPLIED TEST-ONLY PROPOSAL. Never add this to supabase/migrations or use a
-- blanket push. Intended only for Vetit Online Test (apfyfmokcynqiaxqvvxx)
-- after separate review/approval. Test code independently validates project
-- URL/name/ref and requires an explicit one-time cloud-write opt-in.
-- The support RPCs are service_role-only and do not alter seller RLS policies.

begin;
create schema if not exists vetit_test;
revoke all on schema vetit_test from public, anon, authenticated;
grant usage on schema vetit_test to service_role;

create table if not exists vetit_test.runs (
  run_id uuid primary key,
  project_ref text not null check (project_ref in ('apfyfmokcynqiaxqvvxx','local-disposable')),
  status text not null default 'active' check (status in ('active','db_cleaned','cleaned')),
  created_at timestamptz not null default now(), db_cleaned_at timestamptz, cleaned_at timestamptz
);
create table if not exists vetit_test.records (
  run_id uuid not null references vetit_test.runs(run_id),
  kind text not null check (kind in ('auth_user','business','listing','storage_path','market','species','category','category_species')),
  entity_key text not null, parent_key text, created_by_run boolean not null,
  primary key (run_id,kind,entity_key)
);
alter table vetit_test.runs enable row level security;
alter table vetit_test.records enable row level security;
revoke all on vetit_test.runs,vetit_test.records from public, anon, authenticated;
grant all on vetit_test.runs,vetit_test.records to service_role;

create or replace function public.vetit_test_begin_run(p_run_id uuid,p_project_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' or p_project_ref not in ('apfyfmokcynqiaxqvvxx','local-disposable') then
    raise exception 'Verified Test fixture access is required.' using errcode='42501';
  end if;
  if p_run_id is null
    or exists(select 1 from vetit_test.runs where run_id=p_run_id)
    or exists(select 1 from auth.users where raw_app_meta_data->>'vetit_test_run_id'=p_run_id::text)
    or exists(select 1 from public.businesses where display_name like 'Vetit Test '||p_run_id::text||' Seller %')
    or exists(select 1 from public.listings where slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%') then
    raise exception 'Run ID already exists or collides with an existing fixture; choose a fresh UUID.' using errcode='23505';
  end if;
  insert into vetit_test.runs(run_id,project_ref) values(p_run_id,p_project_ref);
end;
$$;

create or replace function public.vetit_test_register_user(p_run_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare run_state text;
begin
  select status into run_state from vetit_test.runs where run_id=p_run_id for update;
  if coalesce(auth.role(),'')<>'service_role' or p_role not in ('seller-a','seller-b','buyer','admin')
    or run_state is distinct from 'active'
    or not exists(select 1 from auth.users u where u.id=p_user_id
      and u.raw_app_meta_data->>'vetit_test_run_id'=p_run_id::text
      and u.raw_app_meta_data->>'vetit_test_role'=p_role
      and (p_role<>'admin' or u.raw_app_meta_data->>'vetit_admin'='true')) then
    raise exception 'Auth user is not owned by this active Test run.' using errcode='42501';
  end if;
  insert into vetit_test.records values(p_run_id,'auth_user',p_user_id::text,null,true) on conflict do nothing;
end;
$$;

create or replace function public.vetit_test_register_record(p_run_id uuid,p_kind text,p_entity_key text,p_parent_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare owned boolean := false; run_state text;
begin
  select status into run_state from vetit_test.runs where run_id=p_run_id for update;
  if coalesce(auth.role(),'')<>'service_role' or run_state is distinct from 'active' then
    raise exception 'Active Test run and service-role access are required.' using errcode='42501';
  end if;
  if p_kind='business' then
    select exists(select 1 from public.businesses b where b.id::text=p_entity_key
      and b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'
      and exists(select 1 from public.business_memberships m join auth.users u on u.id=m.profile_id
        where m.business_id=b.id and m.member_role='owner'
          and u.raw_app_meta_data->>'vetit_test_run_id'=p_run_id::text
          and u.raw_app_meta_data->>'vetit_test_role' in ('seller-a','seller-b'))) into owned;
  elsif p_kind='listing' then
    select exists(select 1 from public.listings l join public.businesses b on b.id=l.business_id
      where l.id::text=p_entity_key and l.business_id::text=p_parent_key and l.kind='product'
      and l.slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%'
      and b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'
      and exists(select 1 from vetit_test.records br where br.run_id=p_run_id and br.kind='business' and br.entity_key=b.id::text)) into owned;
  elsif p_kind='storage_path' then
    select exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id
      join public.businesses b on b.id=l.business_id where i.storage_object_path=p_entity_key
      and i.listing_id::text=p_parent_key and l.slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%'
      and b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'
      and exists(select 1 from vetit_test.records lr where lr.run_id=p_run_id and lr.kind='listing' and lr.entity_key=l.id::text)
      and public.seller_image_path_is_canonical(i.storage_object_path,b.id,l.id)) into owned;
  else raise exception 'Unsupported run-owned record kind.' using errcode='22023';
  end if;
  if not owned then raise exception 'Record does not match this Test run.' using errcode='42501'; end if;
  insert into vetit_test.records values(p_run_id,p_kind,p_entity_key,p_parent_key,true)
  on conflict(run_id,kind,entity_key) do update set parent_key=excluded.parent_key;
end;
$$;

create or replace function public.vetit_test_ensure_marketplace_fixtures(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x record; inserted text; owned boolean; run_state text; ownership jsonb := '[]'::jsonb;
begin
  select status into run_state from vetit_test.runs where run_id=p_run_id for update;
  if coalesce(auth.role(),'')<>'service_role' or run_state is distinct from 'active' then
    raise exception 'Active Test run and service-role access are required.' using errcode='42501';
  end if;
  insert into public.markets(country_code,currency_code,market_status,locale,timezone)
    values('IN','INR','active','en-IN','Asia/Kolkata') on conflict(country_code) do nothing returning country_code into inserted;
  if not exists(select 1 from public.markets where country_code='IN' and currency_code='INR' and market_status='active') then
    raise exception 'India market does not match the INR fixture.';
  end if;
  insert into vetit_test.records values(p_run_id,'market','IN',null,inserted is not null) on conflict do nothing;
  ownership:=ownership||jsonb_build_array(jsonb_build_object('kind','market','entityKey','IN','createdByRun',inserted is not null));

  for x in select * from (values
    ('90000000-0000-4000-8000-000000000001'::uuid,'dogs','Dogs'),
    ('90000000-0000-4000-8000-000000000002'::uuid,'cats','Cats'),
    ('90000000-0000-4000-8000-000000000003'::uuid,'cattle','Livestock & Cattle')) s(id,slug,label)
  loop
    if exists(select 1 from public.animal_species where slug=x.slug and id<>x.id) then raise exception 'Test species slug collision.'; end if;
    insert into public.animal_species(id,slug,display_name,is_active) values(x.id,x.slug,x.label,true)
      on conflict(id) do nothing returning id::text into inserted;
    owned:=inserted is not null;
    if not exists(select 1 from public.animal_species where id=x.id and parent_id is null and slug=x.slug and display_name=x.label and is_active) then
      raise exception 'Test species ID conflicts with existing data.';
    end if;
    insert into vetit_test.records values(p_run_id,'species',x.id::text,null,owned)
      on conflict(run_id,kind,entity_key) do update set created_by_run=vetit_test.records.created_by_run or excluded.created_by_run;
    ownership:=ownership||jsonb_build_array(jsonb_build_object('kind','species','entityKey',x.id,'createdByRun',owned));
  end loop;

  for x in select * from (values
    ('90000000-0000-4000-8000-000000000010'::uuid,null::uuid,'Pet Food & Treats','pet-food-treats',10),
    ('90000000-0000-4000-8000-000000000011'::uuid,'90000000-0000-4000-8000-000000000010'::uuid,'Dog Food','dog-food',11),
    ('90000000-0000-4000-8000-000000000012'::uuid,'90000000-0000-4000-8000-000000000010'::uuid,'Cat Food','cat-food',12),
    ('90000000-0000-4000-8000-000000000013'::uuid,null::uuid,'Livestock Feed & Nutrition','livestock-feed',20)) c(id,parent_id,label,slug,sort_order)
  loop
    if exists(select 1 from public.categories where slug=x.slug and id<>x.id) then raise exception 'Test category slug collision.'; end if;
    insert into public.categories(id,parent_id,name,slug,kind,moderation_status,sort_order)
      values(x.id,x.parent_id,x.label,x.slug,'product','active',x.sort_order) on conflict(id) do nothing returning id::text into inserted;
    owned:=inserted is not null;
    if not exists(select 1 from public.categories where id=x.id and parent_id is not distinct from x.parent_id
      and name=x.label and slug=x.slug and kind='product' and moderation_status='active' and sort_order=x.sort_order) then
      raise exception 'Test category ID conflicts with existing data.';
    end if;
    insert into vetit_test.records values(p_run_id,'category',x.id::text,null,owned)
      on conflict(run_id,kind,entity_key) do update set created_by_run=vetit_test.records.created_by_run or excluded.created_by_run;
    ownership:=ownership||jsonb_build_array(jsonb_build_object('kind','category','entityKey',x.id,'createdByRun',owned));
  end loop;

  for x in select * from (values
    ('90000000-0000-4000-8000-000000000011'::uuid,'90000000-0000-4000-8000-000000000001'::uuid),
    ('90000000-0000-4000-8000-000000000012'::uuid,'90000000-0000-4000-8000-000000000002'::uuid),
    ('90000000-0000-4000-8000-000000000013'::uuid,'90000000-0000-4000-8000-000000000003'::uuid)) cs(category_id,species_id)
  loop
    insert into public.category_species values(x.category_id,x.species_id) on conflict do nothing returning category_id::text into inserted;
    owned:=inserted is not null;
    insert into vetit_test.records values(p_run_id,'category_species',x.category_id::text,x.species_id::text,owned)
      on conflict(run_id,kind,entity_key) do update set created_by_run=vetit_test.records.created_by_run or excluded.created_by_run;
    ownership:=ownership||jsonb_build_array(jsonb_build_object('kind','category_species','entityKey',x.category_id,'parentKey',x.species_id,'createdByRun',owned));
  end loop;
  return jsonb_build_object('dogFoodCategoryId','90000000-0000-4000-8000-000000000011',
    'dogSpeciesId','90000000-0000-4000-8000-000000000001','created',ownership);
end;
$$;

create or replace function public.vetit_test_cleanup_paths(p_run_id uuid)
returns table(storage_object_path text,business_id uuid,listing_id uuid)
language sql security definer set search_path = '' as $$
  select r.entity_key,b.id,l.id from vetit_test.records r
    join public.listings l on l.id::text=r.parent_key
    join public.businesses b on b.id=l.business_id
  where r.run_id=p_run_id and r.kind='storage_path'
    and b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'
    and l.slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%'
  union
  select i.storage_object_path,b.id,l.id from public.listing_images i
    join public.listings l on l.id=i.listing_id join public.businesses b on b.id=l.business_id
  where (b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'
      and l.slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%')
    or exists(select 1 from vetit_test.records r where r.run_id=p_run_id and r.kind='storage_path'
      and r.entity_key=i.storage_object_path and r.parent_key=l.id::text)
$$;

create or replace function public.vetit_test_cleanup_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; run_state text;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Test cleanup is not authorized for this run.' using errcode='42501';
  end if;
  select status into run_state from vetit_test.runs where run_id=p_run_id for update;
  if not found or run_state not in ('active','db_cleaned','cleaned') then
    raise exception 'Test cleanup is not authorized for this run.' using errcode='42501';
  end if;
  if run_state='cleaned' then return; end if;
  if exists(select 1 from public.vetit_test_cleanup_paths(p_run_id) p join storage.objects o
    on o.bucket_id='listing-images' and o.name=p.storage_object_path) then
    raise exception 'Remove run-owned Storage objects before database cleanup.' using errcode='55000';
  end if;
  if (select count(*) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and t.tgname in ('guard_seller_market_compliance','guard_seller_listing_prices',
        'guard_seller_listing_species','guard_seller_listing_images','guard_seller_product_variants')
        and t.tgenabled='O')<>5 then
    raise exception 'Expected seller guard triggers are missing or not enabled; cleanup is refused.' using errcode='55000';
  end if;
  -- Suspend only named seller guards while table locks are held. FK triggers
  -- remain active; any error rolls back deletes and trigger state together.
  execute 'alter table public.listing_markets disable trigger guard_seller_market_compliance';
  execute 'alter table public.listing_prices disable trigger guard_seller_listing_prices';
  execute 'alter table public.listing_species disable trigger guard_seller_listing_species';
  execute 'alter table public.listing_images disable trigger guard_seller_listing_images';
  execute 'alter table public.product_variants disable trigger guard_seller_product_variants';
  delete from public.listings l where l.id::text in(select entity_key from vetit_test.records where run_id=p_run_id and kind='listing')
    or (l.slug like 'vetit-test-'||replace(p_run_id::text,'-','')||'-%' and exists(select 1 from public.businesses b
      where b.id=l.business_id and b.display_name like 'Vetit Test '||p_run_id::text||' Seller %'));
  execute 'alter table public.product_variants enable trigger guard_seller_product_variants';
  execute 'alter table public.listing_images enable trigger guard_seller_listing_images';
  execute 'alter table public.listing_species enable trigger guard_seller_listing_species';
  execute 'alter table public.listing_prices enable trigger guard_seller_listing_prices';
  execute 'alter table public.listing_markets enable trigger guard_seller_market_compliance';
  delete from public.businesses b where b.id::text in(select entity_key from vetit_test.records where run_id=p_run_id and kind='business')
    or b.display_name like 'Vetit Test '||p_run_id::text||' Seller %';
  update vetit_test.runs set status='db_cleaned',db_cleaned_at=coalesce(db_cleaned_at,now()) where run_id=p_run_id;

  delete from public.category_species cs using vetit_test.records owner where owner.kind='category_species' and owner.created_by_run
    and cs.category_id::text=owner.entity_key and cs.species_id::text=owner.parent_key
    and not exists(select 1 from vetit_test.runs active join vetit_test.records used on used.run_id=active.run_id
      where active.status='active' and used.kind='category_species' and used.entity_key=owner.entity_key and used.parent_key=owner.parent_key)
    and not exists(select 1 from public.listing_species ls join public.listings l on l.id=ls.listing_id
      where l.category_id=cs.category_id and ls.species_id=cs.species_id);
  delete from public.categories c using vetit_test.records owner where owner.kind='category' and owner.created_by_run
    and c.id::text=owner.entity_key and c.parent_id is not null
    and not exists(select 1 from vetit_test.runs active join vetit_test.records used on used.run_id=active.run_id where active.status='active' and used.kind='category' and used.entity_key=owner.entity_key)
    and not exists(select 1 from public.category_species cs where cs.category_id=c.id)
    and not exists(select 1 from public.listings l where l.category_id=c.id);
  delete from public.categories c using vetit_test.records owner where owner.kind='category' and owner.created_by_run
    and c.id::text=owner.entity_key and c.parent_id is null
    and not exists(select 1 from vetit_test.runs active join vetit_test.records used on used.run_id=active.run_id where active.status='active' and used.kind='category' and used.entity_key=owner.entity_key)
    and not exists(select 1 from public.categories child where child.parent_id=c.id)
    and not exists(select 1 from public.listings l where l.category_id=c.id);
  delete from public.animal_species s using vetit_test.records owner where owner.kind='species' and owner.created_by_run
    and s.id::text=owner.entity_key
    and not exists(select 1 from vetit_test.runs active join vetit_test.records used on used.run_id=active.run_id where active.status='active' and used.kind='species' and used.entity_key=owner.entity_key)
    and not exists(select 1 from public.listing_species ls where ls.species_id=s.id)
    and not exists(select 1 from public.category_species cs where cs.species_id=s.id)
    and not exists(select 1 from public.animal_species child where child.parent_id=s.id);
  delete from public.markets m using vetit_test.records owner where owner.kind='market' and owner.created_by_run
    and m.country_code=owner.entity_key
    and not exists(select 1 from vetit_test.runs active join vetit_test.records used on used.run_id=active.run_id where active.status='active' and used.kind='market' and used.entity_key=owner.entity_key)
    and not exists(select 1 from public.listing_markets lm where lm.market_code=m.country_code);
end;
$$;

create or replace function public.vetit_test_finish_cleanup(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' or exists(select 1 from auth.users where raw_app_meta_data->>'vetit_test_run_id'=p_run_id::text) then
    raise exception 'Remove all run-owned Auth users before finalizing.' using errcode='55000';
  end if;
  update vetit_test.runs set status='cleaned',cleaned_at=coalesce(cleaned_at,now()) where run_id=p_run_id and status='db_cleaned';
  if not found and not exists(select 1 from vetit_test.runs where run_id=p_run_id and status='cleaned') then
    raise exception 'Database cleanup must finish before Auth finalization.' using errcode='55000';
  end if;
end;
$$;

-- These definer owners are required for the named-trigger lock/restore and for
-- the private ledger/table references. Apply only as the Test database owner.
alter function public.vetit_test_begin_run(uuid,text) owner to postgres;
alter function public.vetit_test_register_user(uuid,uuid,text) owner to postgres;
alter function public.vetit_test_register_record(uuid,text,text,text) owner to postgres;
alter function public.vetit_test_ensure_marketplace_fixtures(uuid) owner to postgres;
alter function public.vetit_test_cleanup_paths(uuid) owner to postgres;
alter function public.vetit_test_cleanup_run(uuid) owner to postgres;
alter function public.vetit_test_finish_cleanup(uuid) owner to postgres;

revoke all on function public.vetit_test_begin_run(uuid,text) from public,anon,authenticated;
revoke all on function public.vetit_test_register_user(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vetit_test_register_record(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.vetit_test_ensure_marketplace_fixtures(uuid) from public,anon,authenticated;
revoke all on function public.vetit_test_cleanup_paths(uuid) from public,anon,authenticated;
revoke all on function public.vetit_test_cleanup_run(uuid) from public,anon,authenticated;
revoke all on function public.vetit_test_finish_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.vetit_test_begin_run(uuid,text) to service_role;
grant execute on function public.vetit_test_register_user(uuid,uuid,text) to service_role;
grant execute on function public.vetit_test_register_record(uuid,text,text,text) to service_role;
grant execute on function public.vetit_test_ensure_marketplace_fixtures(uuid) to service_role;
grant execute on function public.vetit_test_cleanup_paths(uuid) to service_role;
grant execute on function public.vetit_test_cleanup_run(uuid) to service_role;
grant execute on function public.vetit_test_finish_cleanup(uuid) to service_role;
commit;
