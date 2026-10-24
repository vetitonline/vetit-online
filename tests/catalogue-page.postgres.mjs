// Explicit synthetic, isolated loopback database only. Never a hosted database or dump.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
if(process.argv[2]!=='--run-local')throw Error('Explicit isolated local test required');
const executable=process.env.VETIT_CATALOGUE_PSQL;
assert.ok(executable,'Existing local psql executable required');
const connection='postgresql://vetit_catalogue_test@127.0.0.1:55439/postgres';
process.env.PGCONNECT_TIMEOUT='5';
const sql=source=>executePostgresSql(source,{connection,executable});
assert.equal(await sql("select current_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),'vetit_catalogue_test|127.0.0.1|55439');
assert.equal(await sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"),'0','Never reuse/overwrite an existing fixture');
const baseline=fs.readFileSync('supabase/test-project/20261009000000_vetit_marketplace_baseline.sql','utf8');
const tables=baseline.slice(0,baseline.indexOf('create table public.provider_profiles'));
await sql(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);${tables}`);
const names=['listings','categories','businesses','markets','listing_markets','listing_species','animal_species','category_species','listing_prices','product_variants','listing_images'];
// Synthetic policies deliberately allow authenticated reads of private rows,
// so the public RPC's own eligibility predicates must still exclude them.
await sql(names.map(name=>`alter table public.${name} enable row level security;
grant select on public.${name} to anon,authenticated;
create policy synthetic_public on public.${name} for select to anon,authenticated using (${name==='listings'?"title<>'RLS_HIDDEN'":'true'});`).join('\n')+`
insert into public.businesses(id,display_name,verification_status) values
 ('00000000-0000-4000-8000-000000000001','Synthetic seller','verified'),
 ('00000000-0000-4000-8000-000000000002','Blocked seller','suspended');
insert into public.categories(id,name,slug,parent_id,moderation_status) values
 ('00000000-0000-4000-8000-000000000010','Pet care','care',null,'active'),
 ('00000000-0000-4000-8000-000000000011','Food','food','00000000-0000-4000-8000-000000000010','active'),
 ('00000000-0000-4000-8000-000000000012','Inactive','inactive',null,'archived');
insert into public.animal_species(id,slug,display_name) values
 ('00000000-0000-4000-8000-000000000021','dogs','Dogs'),('00000000-0000-4000-8000-000000000022','cats','Cats');
insert into public.category_species(category_id,species_id) select '00000000-0000-4000-8000-000000000011',id from public.animal_species;
insert into public.markets(country_code,currency_code,market_status) values ('IN','INR','active'),('US','USD','active');
insert into public.listings(id,business_id,category_id,kind,title,slug,description,moderation_status,created_at)
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000011','product',case when n=2604 then 'Unique needle आखिरी %_' else 'Synthetic product '||n end,
 'synthetic-'||n,'Offline fixture only','published','2026-10-01' from generate_series(100,2604) n;
insert into public.listing_markets(listing_id,market_code,availability_status,compliance_status)
 select id,'IN','available','approved' from public.listings;
insert into public.listing_species(listing_id,species_id) select id,case when slug='synthetic-101'
 then '00000000-0000-4000-8000-000000000022'::uuid else '00000000-0000-4000-8000-000000000021'::uuid end
 from public.listings where slug<>'synthetic-102';
insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor,valid_from)
 select id,'IN','INR',case when slug='synthetic-106' then 10500 else split_part(slug,'-',2)::integer*100 end,'2026-10-01'
 from public.listings where slug not in ('synthetic-100','synthetic-101','synthetic-102','synthetic-103');
insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor,valid_from) values
 ('00000000-0000-4000-8000-000000000100','IN','INR',100,'2026-10-01'),
 ('00000000-0000-4000-8000-000000000100','IN','INR',300,'2026-10-02'),
 ('00000000-0000-4000-8000-000000000103','IN','USD',1,'2026-10-01');
insert into public.product_variants(id,listing_id,seller_sku,active_status) values
 ('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000000101','V1',true),
 ('00000000-0000-4000-8000-000000008002','00000000-0000-4000-8000-000000000101','V2',true),
 ('00000000-0000-4000-8000-000000008003','00000000-0000-4000-8000-000000000101','OFF',false),
 ('00000000-0000-4000-8000-000000008004','00000000-0000-4000-8000-000000000100','BASE',true);
insert into public.listing_prices(listing_id,market_code,currency_code,product_variant_id,amount_minor,valid_from) values
 ('00000000-0000-4000-8000-000000000101','IN','INR','00000000-0000-4000-8000-000000008001',5,'2026-10-01'),
 ('00000000-0000-4000-8000-000000000101','IN','INR','00000000-0000-4000-8000-000000008001',50,'2026-10-02'),
 ('00000000-0000-4000-8000-000000000101','IN','INR','00000000-0000-4000-8000-000000008002',40,'2026-10-02'),
 ('00000000-0000-4000-8000-000000000101','IN','INR','00000000-0000-4000-8000-000000008003',1,'2026-10-02'),
 ('00000000-0000-4000-8000-000000000100','IN','INR','00000000-0000-4000-8000-000000008004',2,'2026-10-02');
insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor,valid_from,valid_to,status) values
 ('00000000-0000-4000-8000-000000000101','IN','INR',2,statement_timestamp()+interval '1 day',null,'active'),
 ('00000000-0000-4000-8000-000000000101','IN','INR',2,'2026-09-01','2026-09-02','active'),
 ('00000000-0000-4000-8000-000000000101','IN','INR',2,'2026-09-03',null,'inactive');
insert into public.listings(id,business_id,category_id,kind,title,slug,moderation_status,archived_at)
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=5003 then '00000000-0000-4000-8000-000000000002'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end,
 case when n=5004 then '00000000-0000-4000-8000-000000000012'::uuid else '00000000-0000-4000-8000-000000000011'::uuid end,
 case when n=5007 then 'service' else 'product' end,case when n=5008 then 'RLS_HIDDEN' else 'Excluded '||n end,'excluded-'||n,
 case when n=5001 then 'draft' else 'published' end,case when n=5002 then now() end from generate_series(5001,5009) n;
insert into public.listing_markets(listing_id,market_code,availability_status,compliance_status)
 select id,case when slug='excluded-5009' then 'US' else 'IN' end,
 case when slug='excluded-5005' then 'unavailable' else 'available' end,
 case when slug='excluded-5006' then 'rejected' else 'approved' end from public.listings where slug like 'excluded-%';
insert into public.listing_images(listing_id,storage_object_path,sort_order,visibility_status) values
 ('00000000-0000-4000-8000-000000000100','fixture/hidden.webp',0,'hidden'),
 ('00000000-0000-4000-8000-000000000100','fixture/visible.webp',1,'visible');
`);
const migration=fs.readFileSync('supabase/migrations/20261024134913_public_catalogue_page.sql','utf8');
const fingerprint=()=>sql("select md5(string_agg(tablename||policyname||roles::text||qual,'|' order by tablename,policyname)) from pg_policies where schemaname='public';");
const before=await fingerprint();
await sql('alter table public.listing_images disable row level security;');
await assert.rejects(sql(migration),/requires existing RLS/);
assert.equal(await sql("select count(*) from pg_proc where proname='read_public_catalogue_page';"),'0');
await sql('alter table public.listing_images enable row level security;');
await sql(migration);await sql(migration);assert.equal(await fingerprint(),before);
assert.equal(await sql("select prosecdef from pg_proc where proname='read_public_catalogue_page';"),'f');
assert.equal(await sql("select has_function_privilege('service_role','public.read_public_catalogue_page(text,uuid[],uuid,bigint,bigint,text,integer,integer,text)','EXECUTE');"),'f');
console.log('PASS migration prerequisites, idempotence, unchanged policies and invoker/execute ACLs');
const page=async(args='',role='anon')=>JSON.parse(await sql(`set role ${role};select public.read_public_catalogue_page(${args});`));
let result=await page();assert.equal(result.pagination.total,2505);assert.equal(result.products.length,24);assert.equal(result.pagination.truncated,false);
const first=result.products.map(p=>p.id),second=(await page('p_page=>2')).products.map(p=>p.id);
assert.equal(new Set([...first,...second]).size,48);
result=await page('p_page=>10000,p_page_size=>48');assert.equal(result.pagination.page,53);assert.equal(result.products.length,9);assert.equal(result.pagination.hasNext,false);
assert.equal((await page("p_query=>'missing fixture'")).pagination.total,0);
assert.deepEqual((await page("p_query=>'missing fixture'")).products,[]);
console.log('PASS >1,000 catalogue, bounded/disjoint pages, out-of-range clamp and empty results');
for(const role of ['anon','authenticated']){
 assert.equal((await page("p_query=>'Excluded'",role)).pagination.total,0);
 assert.equal((await page("p_query=>'RLS_HIDDEN'",role)).pagination.total,0);
 assert.equal((await page("p_product=>'excluded-5001'",role)).products.length,0);
}
console.log('PASS publication, archive, category, business, market, compliance and caller RLS gates');
for(const query of ['Unique needle','आखिरी','%_','Synthetic seller','Food']){
 const literal=query.replaceAll("'","''");result=await page(`p_query=>'${literal}'`);assert.ok(result.pagination.total>0);
 if(query==='%_')assert.equal(result.pagination.total,1,'Wildcards must be literal');
}
result=await page("p_query=>''' OR true --'");assert.equal(result.pagination.total,0);
assert.equal((await page("p_category_ids=>array['00000000-0000-4000-8000-000000000011']::uuid[]")).pagination.total,2505);
assert.equal((await page('p_category_ids=>array[]::uuid[]')).pagination.total,0);
result=await page("p_species_id=>'00000000-0000-4000-8000-000000000021'");assert.equal(result.pagination.total,2504);
result=await page("p_product=>'synthetic-102'");assert.deepEqual(result.products[0].species,['cats','dogs']);
assert.equal((await page("p_product=>'synthetic-101',p_species_id=>'00000000-0000-4000-8000-000000000021'")).products.length,0);
console.log('PASS literal/international search, category IDs, listing species precedence and category fallback');
result=await page("p_product=>'synthetic-100'");assert.equal(result.products[0].priceMinor,300);assert.equal(result.products[0].priceIsFrom,false);assert.equal(result.products[0].imagePath,'fixture/visible.webp');
result=await page("p_product=>'synthetic-101'");assert.equal(result.products[0].priceMinor,40);assert.equal(result.products[0].priceIsFrom,true);
assert.equal((await page("p_product=>'synthetic-103'")).products[0].priceMinor,null);
result=await page("p_min_minor=>40,p_max_minor=>40");assert.equal(result.pagination.total,1);assert.equal(result.products[0].slug,'synthetic-101');
result=await page("p_sort=>'price-asc'");assert.equal(result.products[0].slug,'synthetic-101');
const full=await page("p_sort=>'price-desc',p_page=>10000,p_page_size=>48");assert.equal(full.products.at(-1).priceMinor,null);
assert.equal((await page("p_product=>'00000000-0000-4000-8000-000000000100'")).products[0].slug,'synthetic-100');
console.log('PASS latest/base/variant/effective/currency price semantics, bounds, NULL ordering, exact lookup and visible images');
for(const args of ['p_page=>0','p_page=>10001','p_page_size=>49','p_page_size=>null',"p_sort=>'bad'",'p_min_minor=>-1','p_min_minor=>30,p_max_minor=>20',"p_query=>repeat('x',101)","p_product=>'bad key'"]){await assert.rejects(page(args),/Invalid catalogue filters/);}
await assert.rejects(sql('set role anon;delete from public.listings;'),/permission denied/);
await sql("update public.markets set market_status='inactive' where country_code='IN';");assert.equal((await page()).pagination.total,0);
console.log('PASS direct RPC bounds, no anonymous writes and inactive market exclusion');
