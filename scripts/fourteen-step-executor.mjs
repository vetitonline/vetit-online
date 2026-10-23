// Offline SQL builder only: no connection, process execution, CLI apply or hosted adapter.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {draftTestExecution} from './draft-test-release-executor.mjs';
import {requireBackup} from './onboarding-atomic-plan.mjs';

export const frozenManifestHash='1c23b6b330360e5374dc0ad958ba446bc84327181fb9290026481c741a0d8655';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const hash=x=>createHash('sha256').update(x).digest('hex');
export function readFourteenPackage(root){
 const bytes=fs.readFileSync(path.join(root,'release-manifest.json'));
 if(hash(bytes)!==frozenManifestHash)throw Error('Frozen manifest drift');
 const manifest=JSON.parse(bytes);
 draftTestExecution(manifest,p=>fs.readFileSync(path.join(root,p)));
 const steps=manifest.entries.map(e=>{
  const raw=fs.readFileSync(path.join(root,e.migrationPath),'utf8');
  const ddl=raw.replace(/^\s*begin;\s*$/im,'').replace(/^\s*commit;\s*$/im,'');
  return {...e,name:path.basename(e.migrationPath).slice(15,-4),raw,ddl};
 });
 return {manifest,steps};
}

// No row contents. Catalog drift checksum, not proof of backup or project identity.
// Covers managed schemas plus Auth/Storage dependencies without reading protected objects.
export const schemaFingerprintSql=`select md5(coalesce(string_agg(item,E'\\n' order by item),'')) from (
 select jsonb_build_array('schema',nspname,pg_get_userbyid(nspowner),nspacl)::text item from pg_namespace where nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl,c.reloptions)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('column',n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(d.adbin,d.adrelid))::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.probin,p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_userbyid(p.proowner))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('constraint',n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated)::text from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('index',schemaname,tablename,indexname,indexdef)::text from pg_indexes where schemaname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid))::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('policy',schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check)::text from pg_policies where schemaname in ('public','vetit_appointments','vetit_moderation','auth','storage')
 union all select jsonb_build_array('default',pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl)::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','vetit_appointments','vetit_moderation','auth','storage') or d.defaclnamespace=0
 union all select jsonb_build_array('enum',n.nspname,t.typname,e.enumsortorder,e.enumlabel)::text from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','vetit_appointments','vetit_moderation')
) metadata`;

export function reconcilePrefix(pkg,rows){
 const expected=[...pkg.manifest.foundationPreserve,...pkg.steps];
 if(!Array.isArray(rows)||rows.length<4||rows.length>18)throw Error('Unexpected ledger length');
 const ordered=[...rows].sort((a,b)=>a.version.localeCompare(b.version));
 for(const [i,row] of ordered.entries()){
  const e=expected[i];
  if(row.version!==e.version||row.name!==e.name||i>=4&&(row.statements?.length!==1||row.statements[0]!==e.raw))throw Error('Ledger gap, unknown entry or payload drift');
 }
 return {prefix:rows.length-4,next:rows.length===18?null:pkg.steps[rows.length-4].version};
}

export function buildFourteenStep(root,{step,backup,preflight,executorRole,now=Date.now()}={}){
 requireBackup(backup,now);
 if(!Number.isInteger(step)||step<1||step>14||!['postgres','vetit_test_admin'].includes(executorRole))throw Error('Explicit step/executor required');
 if(preflight?.projectId!=='apfyfmokcynqiaxqvvxx'||preflight.reviewed!==true||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(preflight.observedAt||'')||!Number.isFinite(Date.parse(preflight.observedAt))||Date.parse(preflight.observedAt)>now||now-Date.parse(preflight.observedAt)>3600000||!Number.isInteger(preflight.prefix)||preflight.prefix<0||preflight.prefix>14||!/^[a-f0-9]{32}$/.test(preflight.schemaHash||'')||typeof preflight.evidenceRef!=='string'||!preflight.evidenceRef.trim()||/[\x00-\x1f\x7f]/.test(preflight.evidenceRef))throw Error('Fresh independently reviewed prerequisite/schema snapshot required');
 const pkg=readFourteenPackage(root),e=pkg.steps[step-1];
 const expected=[...pkg.manifest.foundationPreserve,...pkg.steps];
 const ledger=expected.map((x,i)=>`(${i+1},${quote(x.version)},${quote(x.name)},${i<4?'null::text':quote(x.raw)})`).join(',\n');
 const sql=`-- REVIEW ONLY: independently verify connection identity, prerequisites and backup provenance.
-- One step only. No automatic hosted connection or retry. Earlier commits survive a later failure.
begin isolation level read committed;
set local lock_timeout='5s';set local statement_timeout='120s';set local search_path=pg_catalog,public;
select pg_advisory_xact_lock(861021,2202);
lock table supabase_migrations.schema_migrations in exclusive mode;
do $vetit_fourteen$
declare prefix integer; actual_hash text; receipt record;
begin
 if current_user<>${quote(executorRole)} then raise exception 'Unexpected executor role';end if;
 select count(*)-4 into prefix from supabase_migrations.schema_migrations;
 if prefix<0 or prefix>14 or exists(
  with expected(ordinal,version,name,payload) as (values ${ledger}),
  actual as (select *,row_number() over(order by version) ordinal from supabase_migrations.schema_migrations)
  select 1 from actual a left join expected e using(ordinal) where a.version is distinct from e.version or a.name is distinct from e.name or (e.ordinal>4 and a.statements is distinct from array[e.payload]::text[])
 ) then raise exception 'Unexpected ledger, gap or original payload drift';end if;
 select (${schemaFingerprintSql}) into actual_hash;
 if prefix<>${preflight.prefix} or actual_hash<>${quote(preflight.schemaHash)} then raise exception 'Stale preflight/schema drift; inspect before resume';end if;
 if prefix=0 then
  if to_regnamespace('vetit_release_executor') is not null then raise exception 'Unrecorded executor objects';end if;
 else
  if to_regclass('vetit_release_executor.steps') is null then raise exception 'Missing atomic receipt; separately review adoption, never repair ledger';end if;
  if not exists(select 1 from pg_namespace where nspname='vetit_release_executor' and pg_get_userbyid(nspowner)=current_user)
   or not exists(select 1 from pg_class where oid='vetit_release_executor.steps'::regclass and relrowsecurity and pg_get_userbyid(relowner)=current_user)
   or exists(select 1 from unnest(array['anon','authenticated','service_role']) r where has_schema_privilege(r,'vetit_release_executor','USAGE') or has_table_privilege(r,'vetit_release_executor.steps','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
   then raise exception 'Unsafe receipt ownership/RLS/ACL';end if;
  if (select count(*) from vetit_release_executor.steps)<>prefix then raise exception 'Receipt prefix mismatch';end if;
  for receipt in select * from vetit_release_executor.steps loop
   if receipt.step<1 or receipt.step>prefix or receipt.package_hash<>${quote(frozenManifestHash)} or receipt.payload_hash<>(array[${pkg.steps.map(x=>quote(x.payloadSha256.toLowerCase())).join(',')}])[receipt.step] or receipt.version<>(array[${pkg.steps.map(x=>quote(x.version)).join(',')}])[receipt.step] then raise exception 'Receipt payload drift';end if;
  end loop;
  if (select schema_hash from vetit_release_executor.steps where step=prefix) is distinct from actual_hash then raise exception 'Schema drift since committed prefix';end if;
 end if;
 if prefix>=${step} then return;end if; -- Verified replay never reapplies older DDL.
 if prefix<>${step-1} then raise exception 'Out-of-order step';end if;
 if prefix=0 then
  create schema vetit_release_executor;
  revoke all on schema vetit_release_executor from public,anon,authenticated,service_role;
  create table vetit_release_executor.steps(step integer primary key check(step between 1 and 14),version text unique not null,package_hash text not null,payload_hash text not null,schema_hash text not null,recorded_at timestamptz not null default now());
  alter table vetit_release_executor.steps enable row level security;
  revoke all on table vetit_release_executor.steps from public,anon,authenticated,service_role;
 end if;
 execute ${quote(e.ddl)};
 -- FAULT_TEST_BOUNDARY: production builder never injects failures.
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(e.version)},${quote(e.name)},array[${quote(e.raw)}]::text[]);
 insert into vetit_release_executor.steps(step,version,package_hash,payload_hash,schema_hash) values(${step},${quote(e.version)},${quote(frozenManifestHash)},${quote(e.payloadSha256.toLowerCase())},(${schemaFingerprintSql}));
end;$vetit_fourteen$;
commit;
`;
 return {step,version:e.version,sql,hostedExecutionSupported:false,wholeReleaseAtomic:false};
}
