// Offline immutable-package verifier and REVIEW SQL builder. No DB/network/exec.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readAtomicPackage,requireBackup} from './onboarding-atomic-plan.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const release='supabase/test-project/releases/';
const target='apfyfmokcynqiaxqvvxx';
const digest=(s,algorithm='sha256')=>createHash(algorithm).update(s).digest('hex');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const normalized=s=>s.replaceAll('\r\n','\n');
const frozenPath=release+'vetit-test-20261021-r1/release-manifest.json';
const onboardingPath=release+'vetit-onboarding-20261022-r2/manifest.json';
const signatures=['vetit_catalogue.parent_revision()','vetit_catalogue.child_revision()','vetit_catalogue.bump_child_revision()','vetit_catalogue.lock_edit(uuid,uuid,text)','public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text)','public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)','public.submit_seller_product_v2(uuid,uuid,text)'];
function bodyCheck(sql,signature){
 const name=signature.split('(')[0].replaceAll('.','\\.');
 const head=new RegExp('create or replace function\\s+'+name+'\\s*\\(','i').exec(sql);
 if(!head)return null;
 const tail=sql.slice(head.index+head[0].length),body=/\bas\s+(\$[\w]*\$)([\s\S]*?)\1;/i.exec(tail);
 if(!body)throw Error('Unrecognized function delimiter');
 return{signature,md5:digest(normalized(body[2]),'md5'),definer:/security\s+definer/i.test(tail.slice(0,body.index))};
}
function unwrap(raw){
 if((raw.match(/^begin;\s*$/gm)||[]).length!==1||(raw.match(/^commit;\s*$/gm)||[]).length!==1||!/commit;\s*$/.test(raw))throw Error('Expected one outer transaction');
 return raw.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
}
export function readCataloguePackage(root){
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(m.format!==1||m.package!=='vetit-catalogue-20261022-r1'||m.sourceCommit!=='f07a23cd9f06c4ecca46b8fc447ce8a1cac93ad1'||m.targetProject!==target||m.linked!==false||m.hostedApproved!==false||m.executionReady!==false||m.ledgerConvention!=='raw-payload-single-array-element')throw Error('Package identity/approval drift');
 const frozen=JSON.parse(fs.readFileSync(path.join(repo,frozenPath),'utf8'));
 const {manifest:onboarding}=readAtomicPackage(path.join(repo,release+'vetit-onboarding-20261022-r2'));
 const anchors=[frozenPath,onboardingPath].map(p=>({path:p,sha256:digest(fs.readFileSync(path.join(repo,p)))}));
 const foundations=frozen.foundationPreserve.map(e=>({version:e.version,name:e.name,action:'preserve-do-not-replay'}));
 const prior=frozen.entries.map(e=>({version:e.version,name:path.basename(e.migrationPath,'.sql').slice(15),path:release+'vetit-test-20261021-r1/'+e.migrationPath,sha256:e.payloadSha256.toLowerCase()}));
 const onboard=onboarding.entries[0];prior.push({version:onboard.version,name:onboard.name,path:release+'vetit-onboarding-20261022-r2/'+onboard.path,sha256:onboard.sha256});
 for(const [actual,expected] of [[m.anchors,anchors],[m.foundationPreserve,foundations],[m.prerequisites,prior]])if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Predecessor identity/order drift');
 const texts=prior.map(e=>{const b=fs.readFileSync(path.join(repo,e.path));if(digest(b)!==e.sha256)throw Error('Prerequisite payload drift');return b.toString('utf8');});
 const preSignatures=['public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)','public.submit_seller_product(uuid,uuid)','public.guard_seller_catalog_mutations()','public.moderation_open(text,uuid)','public.ensure_my_profile()',...onboarding.functionChecks.map(f=>f.signature)];
 const checks=preSignatures.map(signature=>{const matches=texts.map(sql=>bodyCheck(sql,signature)).filter(Boolean);if(!matches.length)throw Error('Missing security prerequisite');return matches.at(-1);});
 if(JSON.stringify(checks)!==JSON.stringify(m.preFunctionChecks))throw Error('Function fingerprint drift');
 const payloads={};
 if(m.entries?.length!==2)throw Error('Expected apply and separate pause');
 for(const [i,e] of m.entries.entries()){
  const action=i===0?'apply':'pause',prefix=i===0?'supabase/migrations/':'recovery-review/supabase/migrations/';
  const version=i===0?'20261022134631':'20261022151738',name=i===0?'catalogue_revision_guard':'vetit_catalogue_pause';
  if(e.action!==action||e.version!==version||e.name!==name||e.path!==`${prefix}${version}_${name}.sql`)throw Error('Entry identity/order/path drift');
  const folder=path.join(root,prefix),names=fs.readdirSync(folder);
  if(names.length!==1||names[0]!==`${version}_${name}.sql`)throw Error('Unexpected migration in release directory');
  const expectedHash=i===0?'2a0aa8a92bbdb722ec3f5d17a82126faf33e5ad0543f6431355d6f6990b253ab':'a96b74ed72993e6bb97946d38581776d05315218967d784adfc363ddd91b221b';
  const bytes=fs.readFileSync(path.join(root,e.path));if(digest(bytes)!==e.sha256||e.sha256!==expectedHash)throw Error('Payload checksum drift');
  const raw=bytes.toString('utf8');unwrap(raw);payloads[action]=raw;
 }
 if(/\b(?:drop\s+(?:table|function|trigger|schema|policy)|delete\s+from|truncate\s)/i.test(payloads.pause)||!/create or replace trigger vetit_catalogue_paused/.test(payloads.pause))throw Error('Pause must retain security/data');
 const functions=signatures.map(s=>bodyCheck(payloads.apply,s));if(functions.some(f=>!f))throw Error('Incomplete catalogue security functions');
 const core={...checks[0],signature:'vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)'};
 return{manifest:m,payloads,functions,core,pauseFunction:bodyCheck(payloads.pause,'vetit_catalogue.paused_product_writes()'),priorTexts:texts};
}
const fingerprints=(checks,role)=>checks.map(f=>`if not exists(select 1 from pg_proc where oid=to_regprocedure(${literal(f.signature)}) and md5(replace(prosrc,E'\\r\\n',E'\\n'))=${literal(f.md5)} and prosecdef=${f.definer} and proconfig=array['search_path=""'] and pg_get_userbyid(proowner)=${literal(role)}) then raise exception 'Function/owner/security drift: ${f.signature}';end if;`).join('\n');
export function buildCataloguePlan(root,{action='apply',backup,executorRole,now=Date.now()}={}){
 requireBackup(backup,now);
 if(!['apply','pause'].includes(action)||!['postgres','vetit_test_admin'].includes(executorRole))throw Error('Explicit reviewed action/owner required');
 const {manifest:m,payloads,functions,core,pauseFunction}=readCataloguePackage(root),entry=m.entries.find(e=>e.action===action);
 const prior=[...m.prerequisites,...(action==='pause'?[{...m.entries[0],raw:payloads.apply}]:[])];
 const versions=[...m.foundationPreserve,...prior].map(e=>e.version),withEntry=[...versions,entry.version];
 const verifyPrior=[...m.foundationPreserve,...prior].map(e=>{
  const statements=e.action==='preserve-do-not-replay'?'':` and statements=array[${literal(e.raw??fs.readFileSync(path.join(repo,e.path),'utf8'))}]::text[]`;
  return`if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(e.version)} and name=${literal(e.name)}${statements}) then raise exception 'Predecessor ledger/payload drift: ${e.version}';end if;`;
 }).join('\n');
 const unchanged=m.preFunctionChecks.filter(f=>!f.signature.startsWith('public.save_seller_product('));
 const postFor=paused=>{
 const postFunctions=[...unchanged,core,...functions,...(paused?[pauseFunction]:[])];
 const acl=signatures.filter(s=>s.startsWith('public.')).map(s=>`if has_function_privilege('anon',${literal(s)},'EXECUTE') or has_function_privilege('service_role',${literal(s)},'EXECUTE') or has_function_privilege('authenticated',${literal(s)},'EXECUTE')<>${!paused} then raise exception 'Catalogue RPC privilege drift';end if;`).join('\n');
 return `${fingerprints(postFunctions,executorRole)}
 ${acl}
 if has_schema_privilege('authenticated','vetit_catalogue','USAGE') or has_schema_privilege('anon','vetit_catalogue','USAGE') or has_function_privilege('authenticated','vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)','EXECUTE') then raise exception 'Private helper exposed';end if;
 if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and ((tgrelid='public.listings'::regclass and tgname='vetit_catalogue_revision') or (tgrelid in ('public.listing_species'::regclass,'public.product_variants'::regclass,'public.listing_prices'::regclass,'public.listing_images'::regclass) and tgname in ('vetit_catalogue_child_lock','vetit_catalogue_child_revision'))))<>9 then raise exception 'Revision triggers missing/disabled';end if;
 if exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass and tgname='vetit_catalogue_paused' and tgenabled='O')<>${paused} then raise exception 'Unexpected pause state';end if;
 if (select count(*) from pg_class where oid in ('public.listings'::regclass,'public.listing_species'::regclass,'public.product_variants'::regclass,'public.listing_prices'::regclass,'public.listing_images'::regclass,'public.profiles'::regclass,'public.businesses'::regclass,'public.business_memberships'::regclass) and relrowsecurity)<>8 then raise exception 'RLS missing';end if;
 if not exists(select 1 from pg_attribute where attrelid='public.listings'::regclass and attname='catalogue_revision' and atttypid='bigint'::regtype and attnotnull and not attisdropped) or not has_column_privilege('authenticated','public.listings','catalogue_revision','SELECT') then raise exception 'Revision column/grant drift';end if;`;
 };
 const post=postFor(action==='pause');
 const policySnapshot="select md5(coalesce(string_agg(tablename||policyname||cmd||roles::text||coalesce(qual,'')||coalesce(with_check,''),',' order by tablename,policyname),'')) from pg_policies where schemaname='public'";
 const raw=payloads[action];
 const sql=`-- REVIEW ONLY; project flag is operator attestation, not independent identity proof.
begin isolation level read committed;
set local lock_timeout='5s';set local statement_timeout='120s';
select pg_advisory_xact_lock(861021,2202);
lock table supabase_migrations.schema_migrations in exclusive mode;
do $vetit_catalogue_release$
declare versions text[];policies_before text;policies_after text;
begin
 if current_user<>${literal(executorRole)} or current_setting('vetit.verified_test_project',true) is distinct from '${target}' then raise exception 'Verified Test connection/owner attestation required';end if;
 select array_agg(version order by version) into versions from supabase_migrations.schema_migrations;
 ${verifyPrior}
 if versions=array[${withEntry.map(literal).join(',')}]::text[] then
  if not exists(select 1 from supabase_migrations.schema_migrations where version='${entry.version}' and name='${entry.name}' and statements=array[${literal(raw)}]::text[]) then raise exception 'Recorded catalogue payload drift';end if;
  ${post}
  return; -- Verified replay never executes DDL or reopens a paused catalogue.
 end if;
 if versions is distinct from array[${versions.map(literal).join(',')}]::text[] then raise exception 'Partial/unexpected ledger; stop for review';end if;
 ${action==='apply'?fingerprints(m.preFunctionChecks,executorRole):postFor(false)}
 ${action==='apply'?"if to_regprocedure('vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)') is not null or exists(select 1 from pg_attribute where attrelid='public.listings'::regclass and attname='catalogue_revision' and not attisdropped) then raise exception 'Catalogue schema without matching ledger';end if;":''}
 ${policySnapshot} into policies_before;
 execute ${literal(unwrap(raw))};
 ${post}
 ${policySnapshot} into policies_after;
 if policies_before is distinct from policies_after then raise exception 'Existing public policies changed';end if;
 -- Candidate DDL and exact raw-payload ledger record commit together.
 insert into supabase_migrations.schema_migrations(version,name,statements) values('${entry.version}','${entry.name}',array[${literal(raw)}]::text[]);
end;$vetit_catalogue_release$;
commit;
`;
 return{action,version:entry.version,sql,executionReady:false,hostedExecutionSupported:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {manifest}=readCataloguePackage(process.argv[2]);
 console.log(JSON.stringify({package:manifest.package,priorVersions:manifest.foundationPreserve.length+manifest.prerequisites.length,executionReady:false,hostedExecutionSupported:false,gates:manifest.gates}));
}
