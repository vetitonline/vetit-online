// Explicit loopback synthetic database only. Retains the clone/evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
const database=process.argv[3];
const exerciseExisting=process.argv[2]==='--exercise-local';
if(!['--run-local','--exercise-local'].includes(process.argv[2])||!/^vetit_disposable_catalogue_[0-9_]+$/.test(database??''))throw Error('Explicit isolated local test mode required');
const executable=process.env.VETIT_CATALOGUE_PSQL,passwordFile=process.env.VETIT_CATALOGUE_PASSWORD_FILE;
assert.ok(executable&&passwordFile,'Existing private local fixture credentials required');
process.env.PGPASSWORD=fs.readFileSync(passwordFile,'utf8').split(/\r?\n/)[0];process.env.PGCONNECT_TIMEOUT='5';
const run=(db,text)=>executePostgresSql(text,{executable,connection:`postgresql://vetit_test_admin@127.0.0.1:55432/${db}`});
const sql=text=>run(database,text);
const source='vetit_disposable_corrections_20261020_1902';
assert.equal(await run(source,"select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),`${source}|vetit_test_admin|127.0.0.1|55432`);
assert.equal(await run('postgres',`select count(*) from pg_database where datname='${database}';`),exerciseExisting?'1':'0','Existing mode must be explicit');
if(!exerciseExisting)await run('postgres',`create database ${database} template ${source};`);
const migration=fs.readFileSync('supabase/migrations/20261022134631_catalogue_revision_guard.sql','utf8');
if(!exerciseExisting){await sql(migration);await sql(migration);}
const actor='91000000-0000-4000-8000-000000002201',other='91000000-0000-4000-8000-000000002202';
const auth=(user=actor)=>`set local request.jwt.claim.sub='${user}';set local request.jwt.claims='{}';set local role authenticated;`;
if(!exerciseExisting)await sql(`insert into auth.users(id,raw_user_meta_data) values('${actor}','{}'),('${other}','{}');`);
const business=await sql(exerciseExisting?`select b.id from public.businesses b join public.business_memberships m on m.business_id=b.id where b.display_name='Atomic synthetic catalogue' and m.profile_id='${actor}';`:`begin;${auth()}select public.create_seller_business('Atomic synthetic catalogue',null,'farm',null,null,null);commit;`);
assert.match(business,/^[0-9a-f-]{36}$/);
const taxonomy=JSON.parse(await sql("select jsonb_build_object('category',c.id,'species',s.id) from public.categories c join public.category_species cs on cs.category_id=c.id join public.animal_species s on s.id=cs.species_id where c.kind in ('product','both') and c.moderation_status='active' and s.is_active limit 1;"));
const save=(listing,revision,title='Atomic synthetic feed',variants="'[]'::jsonb",price='49900')=>`select public.save_seller_product_v2(${listing?`'${listing}'`:'null'},'${business}','${title}','atomic-synthetic-feed','Synthetic test only','${taxonomy.category}',array['${taxonomy.species}']::uuid[],${price},${variants},${revision===null?'null':`'${revision}'`});`;
const create=JSON.parse(await sql(exerciseExisting?`select jsonb_build_object('apiVersion',2,'listingId',id,'revision',catalogue_revision::text) from public.listings where business_id='${business}' and slug='atomic-synthetic-feed';`:`begin;${auth()}${save(null,null)}commit;`));
const id=create.listingId;
assert.equal(create.apiVersion,2);assert.match(create.revision,/^[1-9][0-9]*$/);
const snapshot=()=>sql(`select jsonb_build_object('listing',to_jsonb(l),'species',(select jsonb_agg(s) from public.listing_species s where listing_id=l.id),'variants',(select jsonb_agg(v order by v.id) from public.product_variants v where listing_id=l.id),'prices',(select jsonb_agg(p order by p.id) from public.listing_prices p where listing_id=l.id)) from public.listings l where id='${id}';`);
async function denied(text,fragment){await assert.rejects(sql(text),error=>{assert.ok(fragment instanceof RegExp?fragment.test(error.message):String(error.message).includes(fragment),String(error.message));return true;});}
if(!exerciseExisting){
const before=await snapshot();
await denied(`begin;${auth()}${save(id,'0')}commit;`,'Current revision required');
await denied(`begin;${auth(other)}${save(id,create.revision)}commit;`,'Catalogue access denied');
await denied(`begin;${auth()}update public.listings set title='Bypass' where id='${id}';commit;`,/Versioned catalogue RPC required|permission denied/);
await denied(`begin;${auth()}update public.listings set catalogue_revision=1 where id='${id}';commit;`,/Versioned catalogue RPC required|permission denied/);
await denied(`begin;${auth()}select public.save_seller_product('${id}','${business}','Bypass','bypass','', '${taxonomy.category}',array['${taxonomy.species}']::uuid[],100,'[]');commit;`,'Revision contract required');
assert.equal(await snapshot(),before);
console.log('PASS create; malformed/foreign/direct/legacy edits denied without changes');
}

// Synchronize on an actually held row lock, not a timing guess.
const waitLock=async()=>{assert.equal(await sql(`do $$begin for i in 1..150 loop if exists(select 1 from pg_locks where locktype='advisory' and classid=861022 and objid=1314 and granted and database=(select oid from pg_database where datname=current_database())) then return;end if;perform pg_sleep(0.02);end loop;raise exception 'Writer synchronization failed';end;$$;`),'');};
const first=sql(`begin;${auth()}${save(id,create.revision,'First committed edit')}select pg_advisory_xact_lock(861022,1314);select pg_sleep(2);commit;`);
await waitLock();
const second=denied(`begin;${auth()}${save(id,create.revision,'Second stale edit')}commit;`,'Catalogue changed; refresh and review');
const firstResult=JSON.parse((await first).split('\n').find(line=>line.startsWith('{')));await second;
assert.equal(JSON.parse(await snapshot()).listing.title,'First committed edit');
assert.ok(BigInt(firstResult.revision)>BigInt(create.revision));
console.log('PASS two real sessions: committed winner, waiting stale writer conflicts, no overwrite');

const afterFirst=await snapshot();
const rollback=sql(`begin;${auth()}${save(id,firstResult.revision,'Rolled back edit')}select pg_advisory_xact_lock(861022,1314);select pg_sleep(2);rollback;`);
await waitLock();
const survivor=sql(`begin;${auth()}${save(id,firstResult.revision,'Surviving edit')}commit;`);
await rollback;const survived=JSON.parse(await survivor);assert.equal(JSON.parse(await snapshot()).listing.title,'Surviving edit');
assert.ok(BigInt(survived.revision)>BigInt(firstResult.revision));
console.log('PASS rolled-back writer leaves original revision usable by waiting session');

// Force an error AFTER parent/child writes. Statement rollback must undo all.
await sql(`create function vetit_catalogue.inject_failure() returns trigger language plpgsql as $$begin if new.listing_id='${id}' then raise exception 'Injected child failure';end if;return new;end;$$;create trigger zz_catalogue_test_failure after insert on public.listing_prices for each row execute function vetit_catalogue.inject_failure();`);
const beforeFailure=await snapshot();
await denied(`begin;${auth()}${save(id,survived.revision,'Must roll back')}commit;`,'Injected child failure');
assert.equal(await snapshot(),beforeFailure);
// Test trigger deactivation is in the retained synthetic clone only.
await sql('alter table public.listing_prices disable trigger zz_catalogue_test_failure;');
console.log('PASS late child error rolls back listing, species, variants, prices and revision');
await denied(`begin;${auth()}${save(id,survived.revision,'Bad variant',`'[{"seller_sku":"A","option_attributes":{"Size":3},"amount_minor":100}]'::jsonb`,'null')}commit;`,'Variant option values must be text');
assert.equal(await snapshot(),beforeFailure);
const acl=await sql("select has_function_privilege('anon','public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text)','EXECUTE')||'|'||has_function_privilege('service_role','public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text)','EXECUTE')||'|'||has_function_privilege('authenticated','vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)','EXECUTE')||'|'||(select relrowsecurity from pg_class where oid='public.listings'::regclass);");
assert.equal(acl,'false|false|false|true');
console.log('PASS typed variant validation retained; anonymous/service/private-helper RPC ACL denied; listing RLS enabled');
console.log('LOCAL ONLY retained '+database+'; no hosted acceptance or restore claim');
