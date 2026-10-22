// Local synthetic clone only. Never accepts a hosted URL or drops a database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
const source='vetit_disposable_corrections_20261020_1902';
const target=process.argv[3];
const resume=process.argv[2]==='--resume-local';
if(!['--run-local','--resume-local'].includes(process.argv[2])||!/^vetit_disposable_onboarding_[0-9_]+$/.test(target??''))throw Error('Explicit uniquely named local clone required');
const executable=process.env.VETIT_ONBOARDING_PSQL,passwordFile=process.env.VETIT_ONBOARDING_PASSWORD_FILE;
assert.ok(executable&&passwordFile,'Explicit local tools/private password file required');
const env={...process.env,PGPASSWORD:fs.readFileSync(passwordFile,'utf8').split(/\r?\n/)[0],PGCONNECT_TIMEOUT:'5'};
function sql(database,text){return new Promise((resolve,reject)=>{
 const child=execFile(executable,['-X','-w','-q','-A','-t','-h','127.0.0.1','-p','55432','-U','vetit_test_admin','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f','-'],
  {env,timeout:30000,maxBuffer:150000},(error,stdout,stderr)=>{
   if(error){console.error(stderr.trim());reject(Error(stderr.match(/ERROR:\s+(\w{5})/)?.[1]??'LOCAL_SQL_FAILED'));}
   else resolve({text:stdout.trim(),notices:stderr.trim()});
  });child.stdin.on('error',()=>{});child.stdin.end(text);
});}
const guard=`do $$begin if current_database()<>'${target}' or session_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong local clone';end if;end;$$;`;
const proposal=fs.readFileSync(new URL('../supabase/test-project/development/seller-onboarding-v2.proposal.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const identity=id=>`set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);select set_config('request.jwt.claims','{}',true);`;
const rpc=`public.onboard_seller_business_v2('Concurrency farm',null,'farm',null,null,null)`;
async function denial(promise,state){try{await promise;}catch(error){assert.equal(error.message,state);return;}throw Error('Expected SQLSTATE '+state);}
async function marker(id){await sql(target,`do $$begin for n in 1..100 loop if exists(select 1 from pg_locks where locktype='advisory' and objid=${id} and granted) then return;end if;perform pg_sleep(0.03);end loop;raise exception 'Synchronization timeout';end;$$;`);}

assert.equal((await sql(source,"select current_database()||'|'||session_user||'|'||host(inet_server_addr())||'|'||inet_server_port();")).text,`${source}|vetit_test_admin|127.0.0.1|55432`);
assert.equal((await sql('postgres',`select count(*) from pg_database where datname='${target}';`)).text,resume?'1':'0','Target existence does not match explicit clone/resume mode');
if(!resume)await sql('postgres',`create database ${target} template ${source};`);
console.log('LOCAL CLONE '+target+' (retained; source unchanged)');
await sql(target,`begin;${guard}${proposal}${proposal}commit;`);
console.log('PASS proposal replay applied twice on local clone only');
const before=(await sql(target,'select (select count(*) from auth.users)||\'|\'||(select count(*) from public.profiles)||\'|\'||(select count(*) from public.businesses)||\'|\'||(select count(*) from public.business_memberships);')).text;
const result=await sql(target,`begin;set local statement_timeout='15s';set local lock_timeout='2s';${guard}${fs.readFileSync(new URL('./seller-onboarding-v2.rollback.sql',import.meta.url),'utf8')}rollback;`);
console.log(result.notices);
assert.equal((await sql(target,'select (select count(*) from auth.users)||\'|\'||(select count(*) from public.profiles)||\'|\'||(select count(*) from public.businesses)||\'|\'||(select count(*) from public.business_memberships);')).text,before);
console.log('PASS rollback preserved Auth/profile/business/membership counts');

const actor=(await import('node:crypto')).randomUUID(); // A resume never overwrites previous synthetic accounts.
await sql(target,`begin;${guard}insert into auth.users(id) values('${actor}');commit;`);
const first=sql(target,`begin;${guard}${identity(actor)}select ${rpc};select pg_advisory_xact_lock(992622001);select pg_sleep(2);commit;`);
await marker(992622001);
// A second real session must wait on the same profile mutex, not create a duplicate.
await denial(sql(target,`begin;set local lock_timeout='200ms';${identity(actor)}select public.create_seller_business('Legacy concurrent',null,'farm',null,null,null);rollback;`),'55P03');
await first;
const reused=(await sql(target,`begin;${identity(actor)}select ${rpc};rollback;`)).text.split('\n').find(line=>line.includes('"outcome"'));
assert.equal(JSON.parse(reused).outcome,'reused');
assert.equal((await sql(target,`select count(*) from public.business_memberships where profile_id='${actor}' and member_role='owner';`)).text,'1');
console.log('PASS mixed legacy/v2 contention waits; post-commit retry reuses exactly one owner business');

// Row locking only: no trigger toggles/table locks may masquerade as concurrency.
const suspension=sql(target,`begin;${guard}
 select id from public.businesses where id=(select business_id from public.business_memberships where profile_id='${actor}') for update;
 select pg_advisory_xact_lock(992622002);select pg_sleep(2);rollback;`);
await marker(992622002);
await denial(sql(target,`begin;set local lock_timeout='200ms';${identity(actor)}select ${rpc};rollback;`),'55P03');
await suspension;
console.log('PASS retry waits for a concurrent business row lock (rolled back)');
const revocation=sql(target,`begin;${guard}update public.business_memberships set membership_status='suspended' where profile_id='${actor}';select pg_advisory_xact_lock(992622003);select pg_sleep(2);commit;`);
await marker(992622003);
await denial(sql(target,`begin;set local lock_timeout='200ms';${identity(actor)}select ${rpc};rollback;`),'55P03');
await revocation;
await denial(sql(target,`begin;${identity(actor)}select ${rpc};rollback;`),'42501');
console.log('PASS retry waits for membership revocation, then denies after commit');
console.log('NO HOSTED CALLS; no database dropped; clone retained for inspection');
