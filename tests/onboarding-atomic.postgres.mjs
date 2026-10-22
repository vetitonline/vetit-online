// Only synthetic loopback PostgreSQL. Never accepts a network connection URL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
import {buildAtomicPlan,readAtomicPackage} from '../scripts/onboarding-atomic-plan.mjs';
const source='vetit_disposable_corrections_20261020_1902',target=process.argv[3];
const concurrencyOnly=process.argv[2]==='--concurrency-local';
if(!['--run-local','--concurrency-local'].includes(process.argv[2])||!/^vetit_disposable_onboarding_[0-9_]+$/.test(target??''))throw Error('Explicit synthetic local clone mode required');
const executable=process.env.VETIT_ONBOARDING_PSQL,passwordFile=process.env.VETIT_ONBOARDING_PASSWORD_FILE;
assert.ok(executable&&passwordFile,'Explicit existing local tools/private file required');
process.env.PGPASSWORD=fs.readFileSync(passwordFile,'utf8').split(/\r?\n/)[0];process.env.PGCONNECT_TIMEOUT='5';
const sql=(database,text)=>executePostgresSql(text,{executable,connection:`postgresql://vetit_test_admin@127.0.0.1:55432/${database}`});
assert.equal(await sql(source,"select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),`${source}|vetit_test_admin|127.0.0.1|55432`);
assert.equal(await sql('postgres',`select count(*) from pg_database where datname='${target}';`),concurrencyOnly?'1':'0','Target existence must match explicit clone mode');
if(!concurrencyOnly)await sql('postgres',`create database ${target} template ${source};`);
console.log('LOCAL ATOMIC TEST CLONE '+target+'; source unchanged');
const root='supabase/test-project/releases/vetit-onboarding-20261022-r2',{manifest}=readAtomicPackage(root);
// Synthetic ledger fixtures exercise executor mechanics, not prior hosted acceptance.
if(!concurrencyOnly)await sql(target,`create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
do $$begin if exists(select 1 from supabase_migrations.schema_migrations) then raise exception 'Existing ledger must be preserved';end if;end;$$;
insert into supabase_migrations.schema_migrations(version,name,statements) select v,'synthetic_prerequisite',array['synthetic metadata only'] from unnest(array[${manifest.expectedLedgerBefore.map(v=>"'"+v+"'").join(',')}])v;`);
const now=Date.now(),backup={projectId:manifest.targetProject,verified:true,successfulAt:new Date(now-60000).toISOString(),inspectedAt:new Date(now).toISOString(),retentionHours:24,evidenceRef:'SYNTHETIC LOCAL TEST ONLY',restoreProcedureRef:'SYNTHETIC TEST ONLY'};
const apply=buildAtomicPlan(root,{backup,executorRole:'vetit_test_admin',now}),pause=buildAtomicPlan(root,{action:'pause',backup,executorRole:'vetit_test_admin',now});
const unwrap=text=>text.replace(/^begin isolation level read committed;\s*$/m,'').replace(/commit;\n$/,'');
async function denied(text,fragment){try{await sql(target,text);}catch(error){assert.ok(String(error.stderr??error.message).includes(fragment),String(error.stderr??error.message));return;}throw Error('Expected denial '+fragment);}
const counts=`select array[(select count(*) from auth.users),(select count(*) from public.profiles),(select count(*) from public.businesses),(select count(*) from public.business_memberships)]::text;`;
const before=await sql(target,counts);
if(!concurrencyOnly){
await denied(`begin;update supabase_migrations.schema_migrations set version='20990101000000' where version='${manifest.expectedLedgerBefore[0]}';${unwrap(apply.sql)}rollback;`,'Partial/unexpected predecessor ledger');
await denied(apply.sql.replace(' -- Schema and exact payload ledger record commit together; no ledger repair shortcut.'," raise exception 'Injected failure before ledger';"),'Injected failure before ledger');
assert.equal(await sql(target,"select to_regnamespace('vetit_onboarding') is null;"),'t');
assert.equal(await sql(target,`select count(*) from supabase_migrations.schema_migrations where version='${apply.version}';`),'0');
console.log('PASS partial ledger blocks; failure between schema and ledger leaves neither');
await sql(target,apply.sql);
assert.equal(await sql(target,`select count(*) from supabase_migrations.schema_migrations where version='${apply.version}';`),'1');
await sql(target,apply.sql);
assert.equal(await sql(target,`select count(*) from supabase_migrations.schema_migrations where version='${apply.version}';`),'1');
await denied(`begin;update supabase_migrations.schema_migrations set statements=array['changed'] where version='${apply.version}';${unwrap(apply.sql)}rollback;`,'Recorded payload drift');
await denied(`begin;alter table public.businesses disable trigger vetit_onboarding_validate_input;${unwrap(apply.sql)}rollback;`,'Validation/moderation trigger missing');
console.log('PASS schema+ledger commit, exact replay, recorded-payload and schema-drift denial');
// Security cases are re-run only because this is a new package/transaction wrapper.
await sql(target,'begin;'+fs.readFileSync('tests/seller-onboarding-v2.rollback.sql','utf8')+'rollback;');
console.log('PASS five local authorization rollback groups');
const fingerprint=await sql(target,"select string_agg(md5(prosrc),',' order by proname) from pg_proc where proname in ('onboard_seller_business_v2','create_seller_business','validate_business','guard_business_input');");
await sql(target,pause.sql);await sql(target,pause.sql);
assert.equal(await sql(target,"select has_function_privilege('authenticated','public.create_seller_business(text,text,text,text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE');"),'f');
assert.equal(await sql(target,"select string_agg(md5(prosrc),',' order by proname) from pg_proc where proname in ('onboard_seller_business_v2','create_seller_business','validate_business','guard_business_input');"),fingerprint);
assert.equal(await sql(target,"select count(*) from pg_trigger where tgrelid='public.businesses'::regclass and tgname in ('vetit_onboarding_validate_input','guard_seller_business_verification','moderation_verification_gate') and tgenabled='O';"),'3');
assert.equal(await sql(target,counts),before);
console.log('PASS atomic pause/replay retains stronger bodies, validation/moderation guards and data');
}
// Test the execution lock independently of the unchanged business/profile locks.
const ledgerBefore=await sql(target,'select count(*) from supabase_migrations.schema_migrations;');
const held=sql(target,pause.sql.replace('select pg_advisory_xact_lock(861021,2202);','select pg_advisory_xact_lock(861021,2202);select pg_sleep(2);'));
await sql(target,`do $$begin for i in 1..100 loop if exists(select 1 from pg_locks where locktype='advisory' and classid=861021 and objid=2202 and granted and database=(select oid from pg_database where datname=current_database())) then return;end if;perform pg_sleep(0.03);end loop;raise exception 'Lock synchronization timeout';end;$$;`);
await denied(pause.sql.replace("lock_timeout='5s'","lock_timeout='200ms'"),'lock timeout');
await held;
assert.equal(await sql(target,'select count(*) from supabase_migrations.schema_migrations;'),ledgerBefore);
assert.equal(await sql(target,counts),before);
console.log('PASS two executor sessions serialize without duplicate ledger records or data changes');
console.log('Synthetic ledger and paused schema retained in clone; no hosted SQL, no downgrade, no data deletion');
