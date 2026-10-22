// One-shot local packaging; no database/network/hosted execution path.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='supabase/test-project/releases/vetit-onboarding-20261022-r2';
const forwardDir=root+'/supabase/migrations',pauseDir=root+'/recovery-review/supabase/migrations';
const fresh=(directory,suffix)=>{
 const names=fs.readdirSync(directory).filter(n=>new RegExp('^\\d{14}_'+suffix+'\\.sql$').test(n));
 if(names.length!==1||fs.statSync(path.join(directory,names[0])).size!==0)throw Error('Fresh CLI placeholder required; preserve existing package');
 return names[0];
};
const forwardName=fresh(forwardDir,'vetit_onboarding_security'),pauseName=fresh(pauseDir,'vetit_onboarding_pause');
if(fs.existsSync(root+'/manifest.json'))throw Error('Existing manifest preserved');
const old='supabase/test-project/releases/vetit-onboarding-20261022-r1';
const prior=JSON.parse(fs.readFileSync(old+'/manifest.json','utf8'));
const forward=fs.readFileSync(old+'/'+prior.entries[0].path,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
if(sha(forward)!==prior.entries[0].sha256)throw Error('Reviewed forward payload drift');
const bodyChecks=[...forward.matchAll(/create or replace function ([\w.]+)\([^]*?as \$\$([^]*?)\$\$;/g)].map(m=>({
 signature:m[1]+(m[1].endsWith('guard_business_input')?'()':'(text,text,text,text,text,text)'),
 md5:createHash('md5').update(m[2]).digest('hex'),definer:!m[1].endsWith('validate_business'),
}));
if(bodyChecks.length!==4)throw Error('Expected four reviewed functions');
const checks=bodyChecks.map(x=>`if not exists(select 1 from pg_proc where oid=to_regprocedure('${x.signature}') and md5(prosrc)='${x.md5}' and prosecdef=${x.definer} and proconfig=array['search_path=""']) then raise exception 'Onboarding schema drift';end if;`).join('\n');
const pause=`-- Security-preserving pause, not a legacy downgrade. Separate explicit approval required.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
do $pause$begin
 ${checks}
 if not exists(select 1 from pg_trigger where tgrelid='public.businesses'::regclass and tgname='vetit_onboarding_validate_input' and tgenabled='O') then raise exception 'Validation trigger missing';end if;
end;$pause$;
revoke all on function public.create_seller_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.onboard_seller_business_v2(text,text,text,text,text,text) from public,anon,authenticated,service_role;
-- Keep functions, private helpers, validation trigger, RLS, data and ledger intact.
commit;
`;
fs.writeFileSync(path.join(forwardDir,forwardName),forward);
fs.writeFileSync(path.join(pauseDir,pauseName),pause);
fs.writeFileSync(root+'/.gitattributes','*.sql -text\n*.json -text\n',{flag:'wx'});
const manifest={format:2,package:'vetit-onboarding-20261022-r2',targetProject:'apfyfmokcynqiaxqvvxx',sourceCommit:'bb09f9dc35afe970a97e126bc31c3e36ef24af88',supersedesUnapplied:'vetit-onboarding-20261022-r1',executionReady:false,hostedApproved:false,linked:false,expectedLedgerBefore:prior.expectedLedgerBefore,functionChecks:bodyChecks,
 entries:[{action:'apply',version:forwardName.slice(0,14),name:forwardName.slice(15,-4),path:'supabase/migrations/'+forwardName,sha256:sha(forward)},{action:'pause',version:pauseName.slice(0,14),name:pauseName.slice(15,-4),path:'recovery-review/supabase/migrations/'+pauseName,sha256:sha(pause)}]};
fs.writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({package:manifest.package,versions:manifest.entries.map(e=>e.version),executionReady:false}));
