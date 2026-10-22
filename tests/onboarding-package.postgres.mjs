// Package DDL/reversal testing in a fresh local synthetic clone; no hosted URL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
import {verifyOnboardingPackage} from '../scripts/verify-onboarding-package.mjs';
const target=process.argv[3],source='vetit_disposable_corrections_20261020_1902';
const reversalOnly=process.argv[2]==='--reversal-local';
if(!['--run-local','--reversal-local'].includes(process.argv[2])||!/^vetit_disposable_onboarding_[0-9_]+$/.test(target??''))throw Error('Explicit local clone mode required');
const executable=process.env.VETIT_ONBOARDING_PSQL,secretFile=process.env.VETIT_ONBOARDING_PASSWORD_FILE;
assert.ok(executable&&secretFile,'Explicit existing local tools/private file required');
process.env.PGPASSWORD=fs.readFileSync(secretFile,'utf8').split(/\r?\n/)[0];process.env.PGCONNECT_TIMEOUT='5';
const sql=(database,text)=>executePostgresSql(text,{executable,connection:`postgresql://vetit_test_admin@127.0.0.1:55432/${database}`});
const directory='supabase/test-project/releases/vetit-onboarding-20261022-r1';
const verified=verifyOnboardingPackage(directory),manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json','utf8'));
const body=file=>fs.readFileSync(directory+'/'+file,'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const forward=body(manifest.entries[0].path),reverse=body('reversal-review.sql');
const guard=`do $$begin if current_database()<>'${target}' or session_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong local clone';end if;end;$$;`;
assert.equal(await sql(source,"select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"),`${source}|vetit_test_admin|127.0.0.1|55432`);
assert.equal(await sql('postgres',`select count(*) from pg_database where datname='${target}';`),reversalOnly?'1':'0','Target existence does not match explicit clone mode');
if(!reversalOnly)await sql('postgres',`create database ${target} template ${source};`);
console.log('LOCAL PACKAGE CLONE '+target+'; source preserved');
const snapshot=`select jsonb_build_object('counts',array[(select count(*) from auth.users),(select count(*) from public.profiles),(select count(*) from public.businesses),(select count(*) from public.business_memberships)],'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),'grants',(select jsonb_agg(to_jsonb(g) order by table_name,grantee,column_name,privilege_type) from information_schema.column_privileges g where table_schema='public' and table_name in ('businesses','profiles','business_memberships')),'guards',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid='public.businesses'::regclass and not t.tgisinternal),'legacyBody',(select md5(prosrc) from pg_proc where oid='public.create_seller_business(text,text,text,text,text,text)'::regprocedure))::text;`;
const before=await sql(target,snapshot);
async function denied(text,fragment){try{await sql(target,text);}catch(error){assert.ok(String(error.stderr??error.message).includes(fragment),String(error.stderr??error.message));return;}throw Error('Expected denial: '+fragment);}
if(!reversalOnly){
await denied(`begin;${guard}create schema vetit_onboarding;${forward}rollback;`,'Onboarding objects already exist');
await denied(`begin;${guard}revoke execute on function public.create_seller_business(text,text,text,text,text,text) from authenticated;${forward}rollback;`,'Unexpected onboarding ACL');
await denied(`begin;${guard}insert into public.businesses(display_name,public_phone) values('Synthetic invalid legacy row','bad');${forward}rollback;`,'Existing invalid business rows:');
await denied(`begin;${guard}${forward}${forward}rollback;`,'Onboarding objects already exist');
console.log('PASS drift/ACL/invalid-existing-data/reapplication guards fail closed');
}
await denied(`begin;${guard}${forward}${reverse}rollback;`,'Exact reversal approval token required');
await denied(`begin;${guard}${forward}create or replace function vetit_onboarding.guard_business_input() returns trigger language plpgsql as $$begin return new;end;$$;select set_config('vetit.onboarding_reversal_approved','${verified.version}',true);${reverse}rollback;`,'Installed onboarding function drift');
console.log('PASS reversal requires exact approval token and matching installed definitions');
// Validate all prior SQL authorization cases against the packaged forward bytes.
if(!reversalOnly){
 await sql(target,`begin;${guard}${forward}${fs.readFileSync('tests/seller-onboarding-v2.rollback.sql','utf8')}rollback;`);
 console.log('PASS five rollback authorization groups against generated migration');
}
// Reversal restores exact legacy semantics/ACLs/guards without deleting business data.
await sql(target,`begin;${guard}${forward}select set_config('vetit.onboarding_reversal_approved','${verified.version}',true);${reverse}
do $$begin if to_regnamespace('vetit_onboarding') is not null or to_regprocedure('public.onboard_seller_business_v2(text,text,text,text,text,text)') is not null or (select md5(prosrc) from pg_proc where oid='public.create_seller_business(text,text,text,text,text,text)'::regprocedure)<>'${manifest.legacyBodyMd5}' then raise exception 'Reversal mismatch';end if;end;$$;rollback;`);
assert.equal(await sql(target,snapshot),before);
console.log('PASS forward/reversal and outer rollback preserve counts, policies, column grants, moderation guards and legacy function');
console.log('Package remains unapplied after outer rollback; clone retained; no hosted SQL');
