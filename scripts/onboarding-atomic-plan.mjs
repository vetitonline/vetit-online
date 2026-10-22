// Offline SQL review builder only. No network, child process or database calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const target='apfyfmokcynqiaxqvvxx';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
export function readAtomicPackage(root){
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(m.package!=='vetit-onboarding-20261022-r2'||m.targetProject!==target||m.executionReady!==false||m.hostedApproved!==false||m.linked!==false||m.entries.length!==2)throw Error('Unapproved package identity/readiness');
 const frozen=JSON.parse(fs.readFileSync(new URL('../supabase/test-project/releases/vetit-test-20261021-r1/release-manifest.json',import.meta.url),'utf8'));
 const expected=[...frozen.foundationPreserve.map(e=>e.version),...frozen.entries.map(e=>e.version)];
 if(JSON.stringify(m.expectedLedgerBefore)!==JSON.stringify(expected))throw Error('Predecessor drift');
 const payloads={};
 for(const [index,e] of m.entries.entries()){
  const action=index===0?'apply':'pause',prefix=index===0?'supabase/migrations/':'recovery-review/supabase/migrations/';
  if(e.action!==action||!/^\d{14}$/.test(e.version)||e.name!==(index===0?'vetit_onboarding_security':'vetit_onboarding_pause')||e.path!==`${prefix}${e.version}_${e.name}.sql`)throw Error('Unsafe action/path');
  const siblings=fs.readdirSync(path.join(root,prefix));
  if(siblings.length!==1||siblings[0]!==`${e.version}_${e.name}.sql`)throw Error('Unreviewed migration present');
  if(index===1&&e.version<=m.entries[0].version)throw Error('Recovery ordering invalid');
  const text=fs.readFileSync(path.join(root,e.path),'utf8');
  if(createHash('sha256').update(text).digest('hex')!==e.sha256)throw Error('Payload drift');
  if((text.match(/^begin;\s*$/gm)||[]).length!==1||(text.match(/^commit;\s*$/gm)||[]).length!==1)throw Error('Expected one reviewed transaction wrapper');
  payloads[action]=text;
 }
 const actual=[...payloads.apply.matchAll(/create or replace function ([\w.]+)\([^]*?as \$\$([^]*?)\$\$;/g)].map(x=>({signature:x[1]+(x[1].endsWith('guard_business_input')?'()':'(text,text,text,text,text,text)'),md5:createHash('md5').update(x[2]).digest('hex'),definer:!x[1].endsWith('validate_business')}));
 if(actual.length!==4||JSON.stringify(actual)!==JSON.stringify(m.functionChecks))throw Error('Function fingerprint drift');
 if(/\b(drop|delete|truncate)\s/i.test(payloads.pause)||!/revoke all on function public\.create_seller_business/.test(payloads.pause)||!/revoke all on function public\.onboard_seller_business_v2/.test(payloads.pause))throw Error('Recovery must preserve security/data');
 return {manifest:m,payloads};
}
export function requireBackup(evidence,now=Date.now()){
 const successful=Date.parse(evidence?.successfulAt),inspected=Date.parse(evidence?.inspectedAt);
 if(evidence?.projectId!==target||evidence?.verified!==true||!Number.isFinite(successful)||!Number.isFinite(inspected)||successful>now||inspected>now||now-successful>86400000||now-inspected>3600000||inspected<successful||!(evidence.retentionHours>=24)||!evidence.evidenceRef||!evidence.restoreProcedureRef)throw Error('Recent authenticated backup/restore evidence required');
}
export function buildAtomicPlan(root,{action='apply',backup,executorRole,now=Date.now()}={}){
 requireBackup(backup,now);
 if(!['apply','pause'].includes(action)||!['postgres','vetit_test_admin'].includes(executorRole))throw Error('Explicit reviewed action/executor required');
 const {manifest:m,payloads}=readAtomicPackage(root),entry=m.entries.find(e=>e.action===action);
 const predecessors=[...m.expectedLedgerBefore,...(action==='pause'?[m.entries[0].version]:[])];
 const expected=predecessors.map(literal).join(','),withEntry=[...predecessors,entry.version].map(literal).join(',');
 const raw=payloads[action],ddl=raw.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 const fingerprints=m.functionChecks.map(f=>`if not exists(select 1 from pg_proc where oid=to_regprocedure(${literal(f.signature)}) and md5(prosrc)=${literal(f.md5)} and prosecdef=${f.definer} and proconfig=array['search_path=""'] and pg_get_userbyid(proowner)=${literal(executorRole)}) then raise exception 'Ledger/schema drift';end if;`).join('\n');
 const postcheck=`${fingerprints}
 if (select count(*) from pg_trigger where tgrelid='public.businesses'::regclass and tgname in ('vetit_onboarding_validate_input','guard_seller_business_verification','moderation_verification_gate') and tgenabled='O')<>3 then raise exception 'Validation/moderation trigger missing';end if;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','businesses','business_memberships') and c.relrowsecurity)<>3 then raise exception 'RLS missing';end if;
 if has_function_privilege('anon','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE') or has_function_privilege('service_role','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE') or has_function_privilege('anon','public.create_seller_business(text,text,text,text,text,text)','EXECUTE') or has_function_privilege('service_role','public.create_seller_business(text,text,text,text,text,text)','EXECUTE') or has_schema_privilege('authenticated','vetit_onboarding','USAGE') then raise exception 'Unsafe onboarding privileges';end if;
 if has_function_privilege('authenticated','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE')<>${action==='apply'} or has_function_privilege('authenticated','public.create_seller_business(text,text,text,text,text,text)','EXECUTE')<>${action==='apply'} then raise exception 'Unexpected onboarding availability';end if;`;
 const sql=`-- REVIEW ONLY. Connection identity and separate hosted execution approval remain mandatory.
begin isolation level read committed;
set local lock_timeout='5s';set local statement_timeout='120s';
select pg_advisory_xact_lock(861021,2202);
do $vetit_atomic$
declare versions text[];
begin
 if current_user<>${literal(executorRole)} then raise exception 'Unexpected executor role';end if;
 select array_agg(version order by version) into versions from supabase_migrations.schema_migrations;
 if versions=array[${withEntry}]::text[] then
  if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(entry.version)} and name=${literal(entry.name)} and statements=array[${literal(raw)}]::text[]) then raise exception 'Recorded payload drift';end if;
  ${postcheck}
  return; -- Verified replay: do not re-run schema DDL or manufacture ledger state.
 end if;
 if versions is distinct from array[${expected}]::text[] then raise exception 'Partial/unexpected predecessor ledger; stop for reconciliation';end if;
 execute ${literal(ddl)};
 ${postcheck}
 -- Schema and exact payload ledger record commit together; no ledger repair shortcut.
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(entry.version)},${literal(entry.name)},array[${literal(raw)}]::text[]);
end;$vetit_atomic$;
commit;
`;
 return {version:entry.version,action,sql,executionReady:false,hostedExecutionSupported:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {manifest}=readAtomicPackage(process.argv[2]);
 console.log(JSON.stringify({package:manifest.package,executionReady:false,backupVerified:false,hostedExecutionSupported:false,required:'Authenticated backup evidence, exact connection/prerequisite provenance and owner execution approval'}));
}
