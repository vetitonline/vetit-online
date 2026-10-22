// Retired: retained for provenance. Never regenerate the weaker r1 reversal.
throw new Error('r1 generator retired: use security-preserving r2 package; legacy reversal prohibited');
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),relative='supabase/test-project/releases/vetit-onboarding-20261022-r1';
const destination=path.join(root,relative),migrationDir=path.join(destination,'supabase/migrations');
const files=fs.readdirSync(migrationDir).filter(name=>/^\d{14}_vetit_seller_onboarding_v2\.sql$/.test(name));
if(files.length!==1||fs.statSync(path.join(migrationDir,files[0])).size!==0)throw Error('Exactly one fresh empty CLI migration required; existing package preserved');
if(fs.existsSync(path.join(destination,'manifest.json')))throw Error('Package exists; do not overwrite');
const proposalPath='supabase/test-project/development/seller-onboarding-v2.proposal.sql';
const legacyPath='supabase/migrations/20261008210707_vetit_seller_security_hardening.sql';
const proposal=fs.readFileSync(proposalPath,'utf8').replace(/\r\n/g,'\n');
const legacy=fs.readFileSync(legacyPath,'utf8').replace(/\r\n/g,'\n').match(/create or replace function public\.create_seller_business\([\s\S]*?\$\$;/)?.[0];
if(!legacy)throw Error('Reviewed legacy function not found');
const md5=value=>createHash('md5').update(value).digest('hex');
const legacyBody=legacy.match(/as \$\$([\s\S]*)\$\$;/)[1];
if(md5(legacyBody)!=='f10346c4cea4c54f0eafe7dd0dc26c57')throw Error('Legacy comparison base changed');
const version=files[0].slice(0,14);
const frozen=JSON.parse(fs.readFileSync('supabase/test-project/releases/vetit-test-20261021-r1/release-manifest.json','utf8'));
const preflight=`
set local lock_timeout='5s';
set local statement_timeout='120s';
do $preflight$
begin
 if to_regnamespace('vetit_onboarding') is not null or to_regprocedure('public.onboard_seller_business_v2(text,text,text,text,text,text)') is not null then
  raise exception 'Onboarding objects already exist; stop for drift review';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.create_seller_business(text,text,text,text,text,text)')
  and md5(prosrc)='f10346c4cea4c54f0eafe7dd0dc26c57' and prosecdef and proconfig=array['search_path=""']) then
  raise exception 'Reviewed legacy onboarding baseline required';
 end if;
 if has_function_privilege('anon','public.create_seller_business(text,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('service_role','public.create_seller_business(text,text,text,text,text,text)','EXECUTE')
 or not has_function_privilege('authenticated','public.create_seller_business(text,text,text,text,text,text)','EXECUTE') then raise exception 'Unexpected onboarding ACL';end if;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','businesses','business_memberships') and c.relrowsecurity)<>3 then raise exception 'Existing RLS required';end if;
 if (select count(*) from pg_trigger where tgrelid='public.businesses'::regclass and tgname in ('guard_seller_business_verification','moderation_verification_gate') and tgenabled='O')<>2 then raise exception 'Both enabled moderation guards required';end if;
end;$preflight$;
`;
// Validate existing rows without returning private fields or rewriting any data.
const rowCheck=`
do $data$
declare item record; invalid_count bigint:=0;
begin
 for item in select display_name,legal_name,business_type,public_email,public_phone,website_url from public.businesses loop
  begin perform vetit_onboarding.validate_business(item.display_name,item.legal_name,item.business_type,item.public_email,item.public_phone,item.website_url);
  exception when invalid_parameter_value then invalid_count:=invalid_count+1;end;
 end loop;
 if invalid_count>0 then raise exception 'Existing invalid business rows: %; separate remediation approval required',invalid_count;end if;
end;$data$;
`;
const helperEnd='revoke all on function vetit_onboarding.validate_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;';
const forward=proposal.replace(/^begin;$/m,'begin;\n'+preflight).replace(helperEnd,helperEnd+'\n'+rowCheck);
const bodies=[...proposal.matchAll(/create or replace function ([\w.]+)\([^]*?as \$\$([^]*?)\$\$;/g)].map(match=>({name:match[1],body:md5(match[2])}));
if(bodies.length!==4)throw Error('Expected four reviewed function bodies');
const checks=bodies.map(({name,body})=>`if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('${name}(${name.endsWith('guard_business_input')?'':'text,text,text,text,text,text'})') and md5(p.prosrc)='${body}') then raise exception 'Installed onboarding function drift';end if;`).join('\n');
const reverse=`-- REVIEW ONLY: restores weaker legacy validation/retry behavior; separate approval required.
-- No table rows are deleted or rewritten. All DDL is transactional and RESTRICT.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
do $approval$begin
 if current_setting('vetit.onboarding_reversal_approved',true) is distinct from '${version}' then raise exception 'Exact reversal approval token required';end if;
 ${checks}
end;$approval$;
${legacy}
revoke all on function public.create_seller_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_seller_business(text,text,text,text,text,text) to authenticated;
drop trigger vetit_onboarding_validate_input on public.businesses;
drop function public.onboard_seller_business_v2(text,text,text,text,text,text) restrict;
drop function vetit_onboarding.guard_business_input() restrict;
drop function vetit_onboarding.validate_business(text,text,text,text,text,text) restrict;
drop schema vetit_onboarding restrict;
commit;
`;
fs.writeFileSync(path.join(migrationDir,files[0]),forward);
fs.writeFileSync(path.join(destination,'reversal-review.sql'),reverse,{flag:'wx'});
fs.writeFileSync(path.join(destination,'.gitattributes'),'*.sql -text\n*.json -text\n',{flag:'wx'});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const payloads=[`supabase/migrations/${files[0]}`,'reversal-review.sql'];
const manifest={format:1,package:'vetit-onboarding-20261022-r1',targetProject:'apfyfmokcynqiaxqvvxx',version,
 sourceCommit:'080a58197fa9b116e7836e31eeaa511e8e0c60d3',sourcePath:proposalPath,sourceSha256:sha(fs.readFileSync(proposalPath)),
 sourceNormalizedSha256:sha(proposal),legacyBodyMd5:md5(legacyBody),cliVersion:'2.121.0',linked:false,hostedApproved:false,executionReady:false,
 expectedLedgerBefore:[...frozen.foundationPreserve.map(x=>x.version),...frozen.entries.map(x=>x.version)],
 executor:'Not supplied. Atomic schema-plus-ledger recording and reversal ledger strategy require review.',
 grantReview:{newPublicTables:0,anonExecute:false,authenticatedExecute:['create_seller_business','onboard_seller_business_v2'],serviceRoleExecute:false,privateHelpers:true,tableGrantsChanged:false,rlsPoliciesChanged:false},
 entries:payloads.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(destination,file))),automaticForward:file.startsWith('supabase/')}))};
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({package:relative,version,forwardCount:1,reversalAutomatic:false}));
