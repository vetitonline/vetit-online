// Only a retained synthetic clone from catalogue-atomic.postgres.mjs; no hosted URLs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
const db=process.argv[3];if(process.argv[2]!=='--run-local'||!/^vetit_disposable_catalogue_[0-9_]+$/.test(db??''))throw Error('Explicit synthetic loopback clone required');
assert.ok(process.env.VETIT_CATALOGUE_PSQL&&process.env.VETIT_CATALOGUE_PASSWORD_FILE);
process.env.PGPASSWORD=fs.readFileSync(process.env.VETIT_CATALOGUE_PASSWORD_FILE,'utf8').split(/\r?\n/)[0];process.env.PGCONNECT_TIMEOUT='5';
const sql=text=>executePostgresSql(text,{executable:process.env.VETIT_CATALOGUE_PSQL,connection:`postgresql://vetit_test_admin@127.0.0.1:55432/${db}`});
assert.equal(await sql("select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),`${db}|vetit_test_admin|127.0.0.1|55432`);
const core=()=>sql("select md5(prosrc) from pg_proc where oid='vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)'::regprocedure;");
const rls=()=>sql("select md5(string_agg(policyname||coalesce(qual,'')||coalesce(with_check,''),',' order by policyname)) from pg_policies where schemaname='public';");
const beforeCore=await core(),beforeRls=await rls();
await sql(fs.readFileSync('supabase/migrations/20261022134631_catalogue_revision_guard.sql','utf8'));
assert.equal(await core(),beforeCore);assert.equal(await rls(),beforeRls);
console.log('PASS migration replay preserves hardened core body and all public RLS policies');
const actor='91000000-0000-4000-8000-000000002201',other='91000000-0000-4000-8000-000000002202';
const listing=JSON.parse(await sql(`select jsonb_build_object('id',l.id,'business',l.business_id,'category',l.category_id,'revision',l.catalogue_revision::text,'species',(select species_id from public.listing_species where listing_id=l.id limit 1)) from public.listings l join public.business_memberships m on m.business_id=l.business_id where m.profile_id='${actor}' and l.slug='atomic-synthetic-feed';`));
assert.ok(listing?.id);
const auth=(who=actor)=>`set local request.jwt.claim.sub='${who}';set local request.jwt.claims='{}';set local role authenticated;`;
const save=revision=>`select public.save_seller_product_v2('${listing.id}','${listing.business}','Guard test','guard-test','', '${listing.category}',array['${listing.species}']::uuid[],49900,'[]','${revision}');`;
const denied=async(text,part)=>{await assert.rejects(sql(text),e=>{assert.ok(e.message.includes(part),e.message);return true;});};
// Existing image route: authenticated direct reservation, no parent UPDATE grant.
const image='91000000-0000-4000-8000-000000002299';
const afterImage=await sql(`begin;${auth()}insert into public.listing_images(listing_id,storage_object_path,alt_text) values('${listing.id}','${listing.business}/${listing.id}/${image}.png','Synthetic reservation');reset role;select catalogue_revision::text from public.listings where id='${listing.id}';rollback;`);
assert.ok(BigInt(afterImage)>BigInt(listing.revision));
await denied(`begin;${auth()}insert into public.listing_images(listing_id,storage_object_path,alt_text) values('${listing.id}','${listing.business}/${listing.id}/${image}.png','Synthetic reservation');${save(listing.revision)}rollback;`,'Catalogue changed; refresh and review');
await denied(`begin;${auth(other)}insert into public.listing_images(listing_id,storage_object_path,alt_text) values('${listing.id}','${listing.business}/${listing.id}/${image}.png','Foreign reservation');rollback;`,'catalog access');
console.log('PASS existing image reservation works, increments revision and invalidates stale edits; foreign reservation denied');
await denied(`begin;update public.business_memberships set membership_status='suspended' where business_id='${listing.business}' and profile_id='${actor}';${auth()}${save(listing.revision)}rollback;`,'Catalogue access denied');
for(const role of ['anon','service_role'])await denied(`begin;set local role ${role};${save(listing.revision)}rollback;`,'permission denied');
await denied(`begin;${auth()}select public.submit_seller_product_v2('${listing.business}','${listing.id}','1');rollback;`,'Catalogue changed; refresh and review');
// Moderation retains its full validation, screening and durable case workflow.
const submitted=JSON.parse(await sql(`begin;${auth()}select public.submit_seller_product_v2('${listing.business}','${listing.id}','${listing.revision}');rollback;`));
assert.ok(BigInt(submitted.revision)>BigInt(listing.revision));
await denied(`begin;${auth()}select public.submit_seller_product_v2('${listing.business}','${listing.id}','${listing.revision}');${save(submitted.revision)}rollback;`,'Catalogue access denied');
assert.equal(await sql(`select catalogue_revision::text from public.listings where id='${listing.id}';`),listing.revision);
console.log('PASS revoked membership/anonymous/service roles denied; guarded submission advances revision, submitted listing cannot be edited; fixture rolled back');
console.log('LOCAL ONLY '+db+'; no object bytes, hosted sessions or devices tested');
