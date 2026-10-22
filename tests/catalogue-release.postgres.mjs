// Explicit synthetic loopback clone. No hosted URL, restore, overwrite or cleanup.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
import {readCataloguePackage,buildCataloguePlan} from '../scripts/catalogue-release-plan.mjs';
import {readAtomicPackage} from '../scripts/onboarding-atomic-plan.mjs';
const database=process.argv[3],source='vetit_disposable_corrections_20261020_1902';
if(process.argv[2]!=='--run-local'||!/^vetit_disposable_release_[0-9_]+$/.test(database??''))throw Error('Explicit local synthetic clone required');
assert.ok(process.env.VETIT_CATALOGUE_PSQL&&process.env.VETIT_CATALOGUE_PASSWORD_FILE);
process.env.PGPASSWORD=fs.readFileSync(process.env.VETIT_CATALOGUE_PASSWORD_FILE,'utf8').split(/\r?\n/)[0];process.env.PGCONNECT_TIMEOUT='5';
const run=(db,text)=>executePostgresSql(text,{executable:process.env.VETIT_CATALOGUE_PSQL,connection:`postgresql://vetit_test_admin@127.0.0.1:55432/${db}`});
assert.equal(await run(source,"select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),`${source}|vetit_test_admin|127.0.0.1|55432`);
assert.equal(await run('postgres',`select count(*) from pg_database where datname='${database}';`),'0','Never reuse/reset an existing fixture');
await run('postgres',`create database ${database} template ${source};`);
const sql=text=>run(database,"set vetit.verified_test_project='apfyfmokcynqiaxqvvxx';"+text);
const root='supabase/test-project/releases/vetit-catalogue-20261022-r1',{manifest:m}=readCataloguePackage(root);
// Source is an existing synthetic correction fixture, NOT a hosted dump. Bring
// its explicit missing profile/onboarding prerequisites forward before testing.
await sql(fs.readFileSync(m.prerequisites[13].path,'utf8'));
await sql(readAtomicPackage('supabase/test-project/releases/vetit-onboarding-20261022-r2').payloads.apply);
await sql('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
for(const p of [...m.foundationPreserve,...m.prerequisites])await sql(`insert into supabase_migrations.schema_migrations values(${literal(p.version)},${literal(p.name)},array[${literal(p.path?fs.readFileSync(p.path,'utf8'):'SYNTHETIC FOUNDATION METADATA ONLY')}]);`);
const now=Date.now(),backup={projectId:m.targetProject,verified:true,successfulAt:new Date(now-60000).toISOString(),inspectedAt:new Date(now).toISOString(),retentionHours:24,evidenceRef:'SYNTHETIC LOCAL TEST ONLY',restoreProcedureRef:'SYNTHETIC LOCAL TEST ONLY'};
const apply=buildCataloguePlan(root,{backup,executorRole:'vetit_test_admin',now}),pause=buildCataloguePlan(root,{action:'pause',backup,executorRole:'vetit_test_admin',now});
const unwrap=s=>s.replace(/^begin isolation level read committed;\s*$/m,'').replace(/commit;\n$/,'');
const denied=async(text,part)=>assert.rejects(sql(text),e=>{assert.ok(e.message.includes(part),e.message);return true;});
await denied(`begin;update supabase_migrations.schema_migrations set name='wrong' where version='${m.prerequisites[0].version}';${unwrap(apply.sql)}rollback;`,'Predecessor ledger/payload drift');
const injected=apply.sql.replace(' -- Candidate DDL and exact raw-payload ledger record commit together.'," raise exception 'Injected before ledger';");
assert.notEqual(injected,apply.sql,'Failure injection must match a real boundary');
await denied(injected,'Injected before ledger');
assert.equal(await sql("select count(*) from pg_attribute where attrelid='public.listings'::regclass and attname='catalogue_revision' and not attisdropped;"),'0');
assert.equal(await sql(`select count(*) from supabase_migrations.schema_migrations where version='${apply.version}';`),'0');
console.log('PASS predecessor drift blocked; failure after DDL rolls back schema and ledger together');
await sql(apply.sql);await sql(apply.sql);
assert.equal(await sql(`select count(*) from supabase_migrations.schema_migrations where version='${apply.version}';`),'1');
await denied(`begin;alter table public.listings disable trigger vetit_catalogue_revision;${unwrap(apply.sql)}rollback;`,'Revision triggers missing/disabled');
await denied(`begin;update supabase_migrations.schema_migrations set statements=array['altered'] where version='${apply.version}';${unwrap(apply.sql)}rollback;`,'Recorded catalogue payload drift');
console.log('PASS exact apply/replay, one ledger record; trigger and recorded-byte drift denied');

const actor='92000000-0000-4000-8000-000000002211';
await sql(`insert into auth.users(id,raw_user_meta_data) values('${actor}','{}');`);
const auth=`set local request.jwt.claim.sub='${actor}';set local request.jwt.claims='{}';set local role authenticated;`;
const business=await sql(`begin;${auth}select public.create_seller_business('Release pause fixture',null,'farm',null,null,null);commit;`);
const tax=JSON.parse(await sql("select jsonb_build_object('category',c.id,'species',cs.species_id) from public.categories c join public.category_species cs on cs.category_id=c.id where c.kind in ('product','both') and c.moderation_status='active' limit 1;"));
const save=(listing,revision)=>`select public.save_seller_product_v2(${listing?literal(listing):'null'},'${business}','Release synthetic feed','release-synthetic-feed','Synthetic only','${tax.category}',array['${tax.species}']::uuid[],49900,'[]',${revision?literal(revision):'null'});`;
const created=JSON.parse(await sql(`begin;${auth}${save(null,null)}commit;`));
const existingBodies=()=>sql("select md5(string_agg(oid::text||md5(prosrc),',' order by oid)) from pg_proc where pronamespace='vetit_catalogue'::regnamespace and proname<>'paused_product_writes';");
const before=await existingBodies(),listingBefore=await sql(`select to_jsonb(l) from public.listings l where id='${created.listingId}';`);
await sql(pause.sql);await sql(pause.sql);
assert.equal(await existingBodies(),before);
assert.equal(await sql(`select to_jsonb(l) from public.listings l where id='${created.listingId}';`),listingBefore);
await denied(`begin;${auth}${save(created.listingId,created.revision)}rollback;`,'permission denied');
// Function owner can bypass EXECUTE ACL; the additive pause trigger still blocks
// the actual underlying product mutation without undoing revision protections.
await denied(`begin;set local request.jwt.claim.sub='${actor}';set local request.jwt.claims='{}';${save(created.listingId,created.revision)}rollback;`,'Catalogue writes paused for review');
await denied(apply.sql,'Partial/unexpected ledger');
console.log('PASS pause/replay preserves bodies/data, denies caller AND owner product edits, and blocks silent unpause');
console.log('Synthetic fixture/ledger retained: '+database+'; no hosted acceptance or real backup attestation');
