// New synthetic local fixture only. No hosted connection, restore, reset or deletion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
import {readFourteenPackage,buildFourteenStep,schemaFingerprintSql} from '../scripts/fourteen-step-executor.mjs';
const url=new URL(process.env.VETIT_EXECUTOR_DATABASE_URL||'');
assert.equal(process.env.VETIT_EXECUTOR_LOCAL_APPROVED,'1');
assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&url.port==='55432'&&url.username==='vetit_test_admin'&&!url.password&&!url.search&&!url.hash&&/^\/vetit_disposable_executor_[0-9_]+$/.test(url.pathname),'New synthetic loopback database required');
const executable=process.env.VETIT_TEST_PSQL;assert.ok(executable);
const admin=new URL(url);admin.pathname='/postgres';
const run=(sql,connection=url.toString())=>executePostgresSql(sql,{connection,executable});
const db=url.pathname.slice(1),root=fileURLToPath(new URL('../supabase/test-project/releases/vetit-test-20261021-r1/',import.meta.url));
assert.equal(await run(`select count(*) from pg_database where datname='${db}';`,admin.toString()),'0','Refuse existing database');
await run(`create database "${db}";`,admin.toString());console.log('NEW SYNTHETIC DATABASE '+db);
await run(`create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',phone text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to authenticated;grant select on storage.objects to anon;`);
const pkg=readFourteenPackage(root),lit=x=>"'"+x.replaceAll("'","''")+"'";
for(const e of pkg.manifest.foundationPreserve)await run(fs.readFileSync(new URL('../'+e.path,import.meta.url),'utf8'));
await run(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
insert into supabase_migrations.schema_migrations values ${pkg.manifest.foundationPreserve.map(e=>`(${lit(e.version)},${lit(e.name)},array['SYNTHETIC foundation provenance only'])`).join(',')};`);
const snapshot=()=>run(`set search_path=pg_catalog,public;${schemaFingerprintSql};`);
const count=()=>run('select count(*)-4 from supabase_migrations.schema_migrations;');
const plan=async(step)=>{
 const date=new Date().toISOString();
 return buildFourteenStep(root,{step,executorRole:'vetit_test_admin',backup:{projectId:'apfyfmokcynqiaxqvvxx',verified:true,successfulAt:date,inspectedAt:date,retentionHours:24,evidenceRef:'SYNTHETIC ONLY, NOT HOSTED BACKUP',restoreProcedureRef:'Local fixture, not restore proof'},preflight:{projectId:'apfyfmokcynqiaxqvvxx',reviewed:true,observedAt:date,prefix:Number(await count()),schemaHash:await snapshot(),evidenceRef:'SYNTHETIC schema review only'}});
};
let passed=0;const check=async(name,fn)=>{await fn();console.log('PASS '+(++passed)+' '+name);};
const fault=sql=>{const marker='-- FAULT_TEST_BOUNDARY: production builder never injects failures.';assert.equal(sql.split(marker).length,2);return sql.replace(marker,"raise exception 'Injected local failure after DDL';");};
await check('step-one DDL/receipt/ledger failure rolls back together',async()=>{
 const before=await snapshot(),p=await plan(1);await assert.rejects(()=>run(fault(p.sql)),/Injected local failure/);
 assert.equal(await snapshot(),before);assert.equal(await count(),'0');assert.equal(await run("select to_regnamespace('vetit_release_executor') is null;"),'t');
});
await check('out-of-order step is denied without schema changes',async()=>{
 const before=await snapshot(),p=await plan(2);await assert.rejects(()=>run(p.sql),/Out-of-order/);assert.equal(await snapshot(),before);
});
for(let step=1;step<=6;step++)await run((await plan(step)).sql);
await check('mid-release failure preserves exact six-step prefix and safely resumes',async()=>{
 const before=await snapshot(),p=await plan(7);await assert.rejects(()=>run(fault(p.sql)),/Injected local failure/);
 assert.equal(await count(),'6');assert.equal(await snapshot(),before);assert.equal(await run('select count(*) from vetit_release_executor.steps;'),'6');
 await run((await plan(7)).sql);assert.equal(await count(),'7');
});
await check('lost acknowledgement and old-step replay do not overwrite later protections',async()=>{
 const before=await snapshot();await run((await plan(7)).sql);await run((await plan(1)).sql);
 assert.equal(await snapshot(),before);assert.equal(await count(),'7');
});
await check('stale reviewed snapshot rejects intervening changes',async()=>{
 const p=await plan(8);await run('begin;comment on table public.profiles is \'synthetic only\';rollback;');
 // A metadata change covered by the fingerprint, then an exact inverse; no fixtures overwritten.
 await run('alter table public.profiles add column executor_drift_probe integer;');
 await assert.rejects(()=>run(p.sql),/Stale preflight/);
 await assert.rejects(async()=>run((await plan(8)).sql),/Schema drift since committed prefix/);
 await run('alter table public.profiles drop column executor_drift_probe;');
});
await check('ledger tampering and missing receipts fail closed inside rolled-back probes',async()=>{
 const p=await plan(8);
 await assert.rejects(()=>run(p.sql.replace('do $vetit_fourteen$',"update supabase_migrations.schema_migrations set statements=array['tampered'] where version='"+pkg.steps[2].version+"';\ndo $vetit_fourteen$")),/payload drift/);
 await assert.rejects(()=>run(p.sql.replace('do $vetit_fourteen$',"delete from vetit_release_executor.steps where step=4;\ndo $vetit_fourteen$")),/Receipt prefix mismatch/);
 assert.equal(await count(),'7');assert.equal(await run('select count(*) from vetit_release_executor.steps;'),'7');
});
await check('simultaneous same-step calls serialize; stale contender cannot double apply',async()=>{
 const p=await plan(8),held=p.sql.replace('-- FAULT_TEST_BOUNDARY: production builder never injects failures.',"perform pg_advisory_xact_lock(861021,2299);perform pg_sleep(0.5);");
 const first=run(held);
 let seen=false;
 for(let i=0;i<100;i++){if(await run("select exists(select 1 from pg_locks where locktype='advisory' and classid=861021 and objid=2299 and granted);")==='t'){seen=true;break;}}
 assert.ok(seen,'Observed first transaction holding its test marker');
 const second=run(p.sql).then(()=>null,error=>error);
 await first;assert.match(String(await second),/Stale preflight/);
 assert.equal(await count(),'8');assert.equal(await run('select count(*) from vetit_release_executor.steps where step=8;'),'1');
});
for(let step=9;step<=14;step++)await run((await plan(step)).sql);
await check('all fourteen exact ledger payloads/receipts committed; final replay is inert',async()=>{
 assert.equal(await count(),'14');assert.equal(await run('select count(*) from vetit_release_executor.steps;'),'14');
 const before=await snapshot();await run((await plan(14)).sql);await run((await plan(1)).sql);assert.equal(await snapshot(),before);
 for(const e of pkg.steps)assert.equal(await run(`select statements=array[${lit(e.raw)}]::text[] and name=${lit(e.name)} from supabase_migrations.schema_migrations where version=${lit(e.version)};`),'t');
});
await check('receipt RLS/ACL and key composed security boundaries remain intact',async()=>{
 for(const role of ['anon','authenticated','service_role'])assert.equal(await run(`select has_schema_privilege('${role}','vetit_release_executor','USAGE');`),'f');
 assert.equal(await run("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"),'0');
 assert.equal(await run("select has_table_privilege('anon','public.fulfilment_events','SELECT');"),'f');
 assert.equal(await run("select has_function_privilege('anon','public.ensure_my_profile()','EXECUTE');"),'f');
});
console.log(`RESULT ${passed}/${passed} groups passed; fourteen migrations applied once; synthetic fixture preserved: ${db}`);
