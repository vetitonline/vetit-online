// Synthetic local clone only; existing source database/fixtures are preserved.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
if(process.argv[2]!=='--run-local')throw Error('Explicit loopback validation required');
const executable=process.env.VETIT_CATALOGUE_PSQL;
assert.ok(executable,'Existing local psql required');process.env.PGCONNECT_TIMEOUT='5';
const database='vetit_catalogue_cursor_20261024_1';
const run=(db,text)=>executePostgresSql(text,{connection:`postgresql://vetit_catalogue_test@127.0.0.1:55439/${db}`,executable});
assert.equal(await run('postgres',"select current_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),'vetit_catalogue_test|127.0.0.1|55439');
assert.equal(await run('postgres','select count(*) from public.listings;'),'2514','Known synthetic predecessor required');
assert.equal(await run('postgres',`select count(*) from pg_database where datname='${database}';`),'0','Never overwrite a test database');
await run('postgres',`create database ${database} template postgres;`);
const sql=text=>run(database,text);
await sql(`update public.markets set market_status='active' where country_code='IN';
insert into public.listings(id,business_id,category_id,kind,title,slug,description,moderation_status,created_at)
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',
 'product','Cursor volume '||n,'cursor-volume-'||n,'Offline representative volume','published','2026-10-10T10:00:00.123456Z' from generate_series(10000,29999) n;
insert into public.listing_markets(listing_id,market_code,availability_status,compliance_status)
 select id,'IN','available','approved' from public.listings where slug like 'cursor-volume-%';
insert into public.listing_species(listing_id,species_id) select id,'00000000-0000-4000-8000-000000000021' from public.listings where slug like 'cursor-volume-%';
insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor,valid_from)
 select id,'IN','INR',10000,'2026-10-01' from public.listings where slug like 'cursor-volume-%';`);
const policyBefore=await sql("select md5(string_agg(tablename||policyname||roles::text||qual,'|' order by tablename,policyname)) from pg_policies where schemaname='public';");
const migration=fs.readFileSync('supabase/migrations/20261024151034_catalogue_indexed_search_cursor.sql','utf8');
await sql(migration);await sql(migration);await sql('analyze public.listings;analyze public.listing_prices;');
assert.equal(await sql("select md5(string_agg(tablename||policyname||roles::text||qual,'|' order by tablename,policyname)) from pg_policies where schemaname='public';"),policyBefore);
assert.equal(await sql("select prosecdef from pg_proc where proname='read_public_catalogue_window';"),'f');
assert.equal(await sql("select has_function_privilege('service_role','public.read_public_catalogue_window(text,uuid[],uuid,bigint,bigint,integer,timestamptz,uuid,text)','EXECUTE');"),'f');
console.log('PASS additive migration, unchanged RLS, invoker ACLs and repeat application');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const window=async(args='',role='anon')=>JSON.parse(await sql(`set role ${role};select public.read_public_catalogue_window(${args});`));
const boundary=(row,direction='next')=>`p_boundary_time=>${literal(row.createdAt)},p_boundary_id=>${literal(row.id)},p_direction=>${literal(direction)}`;
const first=await window();assert.equal(first.products.length,24);assert.equal(first.window.hasPrevious,false);assert.equal(first.window.hasNext,true);assert.match(first.window.last.createdAt,/123456Z$/);
const next=await window(boundary(first.window.last));assert.equal(new Set([...first.products,...next.products].map(p=>p.id)).size,48);
const previous=await window(boundary(next.window.first,'previous'));assert.deepEqual(previous.products.map(p=>p.id),first.products.map(p=>p.id));
const deep=await window("p_boundary_time=>'2026-10-10T10:00:00.123456Z',p_boundary_id=>'00000000-0000-4000-8000-000000029990'");assert.equal(deep.products[0].slug,'cursor-volume-29991');
assert.ok(!('pagination' in first));assert.equal((await window("p_query=>'missing fixture'")).products.length,0);
console.log('PASS forward/backward/tie/deep cursor windows without counts or OFFSET; empty results');
// New rows above the boundary do not duplicate or shift a following window.
await sql(`insert into public.listings(id,business_id,category_id,kind,title,slug,moderation_status,created_at)
 values('00000000-0000-4000-8000-000000090000','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','product','Synthetic newly published','newly-published','published','2026-10-11');
insert into public.listing_markets values('00000000-0000-4000-8000-000000090000','IN','available','approved');`);
assert.deepEqual((await window(boundary(first.window.last))).products.map(p=>p.id),next.products.map(p=>p.id));
console.log('PASS insert between requests does not shift the next keyset window');
for(const query of ['needle','आखिरी','%_','2603 Offline','seller','Food']){
 const v1=JSON.parse(await sql(`set role anon;select public.read_public_catalogue_page(p_query=>${literal(query)});`));
 const v2=await window(`p_query=>${literal(query)}`);assert.equal(v2.products.length,Math.min(v1.pagination.total,24));assert.deepEqual(v2.products.map(p=>p.id),v1.products.map(p=>p.id));
 assert.ok(v1.pagination.total>0);
}
for(const role of ['anon','authenticated'])for(const query of ['Excluded','RLS_HIDDEN'])assert.equal((await window(`p_query=>${literal(query)}`,role)).products.length,0);
assert.equal((await window("p_species_id=>'00000000-0000-4000-8000-000000000021',p_min_minor=>40,p_max_minor=>40")).products.length,0);
assert.equal((await window('p_min_minor=>40,p_max_minor=>40')).products[0].slug,'synthetic-101');
for(const args of ['p_page_size=>49',"p_direction=>'bad'","p_boundary_id=>'00000000-0000-4000-8000-000000000100'",'p_min_minor=>40,p_max_minor=>20'])await assert.rejects(window(args),/Invalid catalogue window/);
console.log('PASS indexed literal/regional and phrase fallback search parity, prices, species, RLS and direct RPC validation');
const indexQuery="select id from public.listings where kind='product' and moderation_status='published' and archived_at is null and lower(title||' '||coalesce(description,'')) like '%needle%';";
const explain=async(query,role)=>JSON.parse(await sql((role?`set role ${role};`:'')+'explain(analyze,buffers,format json) '+query));
const indexNames=plan=>{const names=[];const walk=x=>{if(x&&typeof x==='object'){if(x['Index Name'])names.push(x['Index Name']);Object.values(x).forEach(walk);}};walk(plan);return names;};
const ownerSearch=await explain(indexQuery),anonSearch=await explain(indexQuery,'anon');
assert.ok(indexNames(ownerSearch).includes('listings_catalogue_text_trgm_idx'),'Index must be usable without planner forcing');
const firstPlan=await explain('select public.read_public_catalogue_window();','anon');
const deepPlan=await explain("select public.read_public_catalogue_window(p_boundary_time=>'2026-10-10T10:00:00.123456Z',p_boundary_id=>'00000000-0000-4000-8000-000000029990');",'anon');
const evidence={kind:'Synthetic local benchmark, NOT hosted Test acceptance',database,visibleProducts:22506,ownerSearchIndexes:indexNames(ownerSearch),anonSearchIndexes:indexNames(anonSearch),ownerSearch,anonSearch,firstWindow:firstPlan,deepWindow:deepPlan};
const output=process.env.VETIT_CURSOR_PERFORMANCE_OUTPUT;assert.ok(output&&!fs.existsSync(output),'New explicit evidence output required');fs.writeFileSync(output,JSON.stringify(evidence,null,2));
console.log('PASS local 22,506-product plans recorded; owner trigram index verified; anon/RLS plans recorded separately');
