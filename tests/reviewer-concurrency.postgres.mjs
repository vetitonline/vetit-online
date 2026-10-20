// Explicit local-only concurrency acceptance; preserves the newly created clone.
import fs from 'node:fs';import {execFile} from 'node:child_process';
const binary='D:/VetitTestTools/Postgres17/pgsql/bin/psql.exe';
const source='vetit_disposable_corrections_20261018_1302';
const target='vetit_disposable_reviewer_concurrency_20261019';
const profile='10000000-0000-4000-8000-000000000007',business='20000000-0000-4000-8000-000000000001',caseId='90000000-0000-4000-8000-000000000041';
if(process.argv[2]!=='--run-local')throw Error('Explicit local-only invocation required.');
const password=fs.readFileSync('D:/VetitTestTools/Postgres17/appointment-test-private/test-password.txt','utf8').split(/\r?\n/)[0];
const env={...process.env,PGPASSWORD:password,PGCONNECT_TIMEOUT:'5'};
function sql(database,text){return new Promise((resolve,reject)=>{
 const child=execFile(binary,['-X','-w','-q','-A','-t','-h','127.0.0.1','-p','55432','-U','vetit_test_admin','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-'],{env,timeout:20000,maxBuffer:100000},(error,stdout,stderr)=>{if(error){const state=stderr.match(/ERROR:\s+(\w{5})/)?.[1];reject(Error(state??(error.code==='EPERM'?'SPAWN_EPERM':'LOCAL_SQL_FAILED')));}else resolve(stdout.trim());});child.stdin.on('error',()=>{});child.stdin.end(text);
});}
const identity=`select set_config('request.jwt.claim.sub','${profile}',true);select set_config('request.jwt.claims','{"app_metadata":{"vetit_reviewer":true}}',true);`;
const guard=`do $$begin if current_database()<>'${target}' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong local database.';end if;end;$$;`;
async function expectState(promise,state){try{await promise;throw Error('EXPECTED_DENIAL_ABSENT');}catch(error){if(error.message!==state)throw error;}}
async function waitMarker(marker){await sql(target,`do $$begin for n in 1..40 loop if exists(select 1 from pg_locks where locktype='advisory' and objid=${marker} and granted) then return;end if;perform pg_sleep(0.05);end loop;raise exception 'Synchronization timeout.';end;$$;`);}
try{
 const actual=await sql(source,"select current_database()||'|'||current_user||'|'||host(inet_server_addr())||'|'||inet_server_port();");
 if(actual!==`${source}|vetit_test_admin|127.0.0.1|55432`)throw Error('SOURCE_IDENTITY_FAILED');
 if(await sql('postgres',`select count(*) from pg_database where datname='${target}';`)!=='0')throw Error('TARGET_EXISTS_PRESERVED');
 await sql('postgres',`create database ${target} template ${source};`);
 const proposal=fs.readFileSync(new URL('../supabase/test-project/release-corrections/business-scoped-moderation.proposal.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 await sql(target,`begin;${guard}alter table auth.users add column if not exists raw_app_meta_data jsonb;${proposal}
 update auth.users set raw_app_meta_data='{"vetit_reviewer":true}' where id='${profile}';
 insert into vetit_moderation.reviewers(profile_id,enabled) values('${profile}',true) on conflict(profile_id) do update set enabled=true;
 insert into vetit_moderation.reviewer_scopes(profile_id,business_id,can_read,can_review,enabled,expires_at) values('${profile}','${business}',true,true,true,clock_timestamp()+interval '1 hour');
 insert into vetit_moderation.cases(id,subject_kind,subject_id,business_id,revision) values('${caseId}','seller','${business}','${business}',vetit_moderation.fingerprint('seller','${business}'));commit;`);
 const hold=sql(target,`begin;${guard}${identity}select vetit_moderation.require_scope('${business}','review');select pg_advisory_xact_lock(992601001);select pg_sleep(2);rollback;`);
 await waitMarker(992601001);
 await expectState(sql(target,`set lock_timeout='250ms';update vetit_moderation.reviewer_scopes set enabled=false where profile_id='${profile}' and business_id='${business}';`),'55P03');
 await expectState(sql(target,`set lock_timeout='250ms';update auth.users set raw_app_meta_data='{}' where id='${profile}';`),'55P03');
 await hold;
 console.log('PASS active scope check serializes grant and identity revocation');
 const revoke=sql(target,`begin;${guard}update vetit_moderation.reviewer_scopes set enabled=false where profile_id='${profile}' and business_id='${business}';select pg_advisory_xact_lock(992601002);select pg_sleep(1);commit;`);
 await waitMarker(992601002);
 await expectState(sql(target,`begin;${identity}select public.moderation_decide('${caseId}',1,'reject',gen_random_uuid(),array['SYNTHETIC']);rollback;`),'42501');await revoke;
 console.log('PASS grant revocation committed ahead of waiting decision denies decision');
 await sql(target,`update vetit_moderation.reviewer_scopes set enabled=true where profile_id='${profile}' and business_id='${business}';`);
 const revokeIdentity=sql(target,`begin;${guard}update auth.users set raw_app_meta_data='{}' where id='${profile}';select pg_advisory_xact_lock(992601003);select pg_sleep(1);commit;`);
 await waitMarker(992601003);
 await expectState(sql(target,`begin;${identity}select public.moderation_decide('${caseId}',1,'reject',gen_random_uuid(),array['SYNTHETIC']);rollback;`),'42501');await revokeIdentity;
 console.log('PASS trusted identity revocation denies waiting decision despite stale JWT');
 const unchanged=await sql(target,`select state='pending' and version=1 and not exists(select 1 from vetit_moderation.events where case_id='${caseId}') from vetit_moderation.cases where id='${caseId}';`);
 if(unchanged!=='t')throw Error('DENIED_DECISION_CHANGED_STATE');
 console.log(JSON.stringify({database:target,concurrencyGroupsPassed:3,deniedDecisionsUnchanged:true,clonePreserved:true,hostedAccess:false}));
}catch(error){console.error('Local concurrency acceptance stopped: '+error.message+'; any created clone preserved.');process.exitCode=1;}
