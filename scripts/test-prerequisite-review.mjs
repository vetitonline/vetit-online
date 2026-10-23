// Offline metadata review only. No connection, SQL execution or credential access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFourteenPackage,reconcilePrefix} from './fourteen-step-executor.mjs';
import {requireBackup} from './onboarding-atomic-plan.mjs';
const repository=fileURLToPath(new URL('../',import.meta.url));
const release=path.join(repository,'supabase/test-project/releases/vetit-test-20261021-r1');
const normalized=s=>s.replaceAll('\r\n','\n');
const digest=(s,algorithm='sha256')=>createHash(algorithm).update(s).digest('hex');
export const prerequisiteCounts=['duplicate_default_addresses','duplicate_base_cart_lines','invalid_payment_parent_count','provider_location_business_mismatch','booking_listing_business_mismatch','invalid_price_intervals','unknown_held_slots_require_review','potential_service_slot_overlap_pairs'];
export const criticalFunctions=[
 'public.create_seller_business(text,text,text,text,text,text)',
 'public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)',
 'public.submit_seller_product(uuid,uuid)',
 'public.guard_seller_moderation_fields()',
 'public.guard_seller_catalog_mutations()',
 'public.handle_new_auth_user_profile()',
 'public.ensure_my_profile()',
 'public.onboard_seller_business_v2(text,text,text,text,text,text)',
 'public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text)',
 'public.submit_seller_product_v2(uuid,uuid,text)',
];

function reviewedSources(prefix){
 if(!Number.isInteger(prefix)||prefix<0||prefix>14)throw Error('Fourteen-step prefix required');
 const pkg=readFourteenPackage(release);
 return pkg.manifest.foundationPreserve.map(e=>{
  const sql=normalized(fs.readFileSync(path.join(repository,e.path),'utf8'));
  if(digest(sql)!==e.sha256.toLowerCase())throw Error('Foundation source drift');
  return sql;
 }).concat(pkg.steps.slice(0,prefix).map(e=>normalized(e.raw)));
}
export function expectedPublicTables(prefix){
 return [...new Set(reviewedSources(prefix).flatMap(sql=>[...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)].map(m=>m[1])))].sort();
}
export function expectedCriticalFunctions(prefix){
 const sources=reviewedSources(prefix);
 return criticalFunctions.map(signature=>{
  const name=signature.split('(')[0].replaceAll('.','\\.');let expected=null;
  for(const sql of sources){
   const matches=[...sql.matchAll(new RegExp('create or replace function\\s+'+name+'\\s*\\(','gi'))];
   if(matches.length>1)throw Error('Ambiguous critical function source');
   if(!matches.length)continue;
   const tail=sql.slice(matches[0].index+matches[0][0].length);
   const body=/\bas\s+(\$[\w]*\$)([\s\S]*?)\1;/i.exec(tail);
   if(!body||!/set\s+search_path\s*=\s*''/i.test(tail.slice(0,body.index)))throw Error('Unreviewed critical function header');
   expected={signature,bodyMd5:digest(body[2],'md5'),securityDefiner:/security\s+definer/i.test(tail.slice(0,body.index)),config:['search_path=""']};
  }
  return expected??{signature,absent:true};
 });
}

export function reviewTestPrerequisites(packet,{now=Date.now()}={}){
 const findings=[];
 const add=(status,code)=>findings.push({status,code});
 const fresh=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString().slice(0,19)===value.slice(0,19)&&Date.parse(value)<=now&&now-Date.parse(value)<=3600000;
 if(!packet||packet.format!==1||!Number.isFinite(now))return{format:1,scope:'offline-evidence-comparison-only',prefix:null,hostedExecutionApproved:false,blockingFindings:['INVALID_PACKET'],findings:[{status:'BLOCKED',code:'INVALID_PACKET'}]};
 if(packet.projectId!=='apfyfmokcynqiaxqvvxx'||packet.identity?.independentlyReviewed!==true||typeof packet.identity?.evidenceRef!=='string'||!packet.identity.evidenceRef.trim()||packet.provenance!=='authenticated-read-only')add('BLOCKED','AUTHENTICATED_TEST_IDENTITY_NOT_ESTABLISHED');
 if(!fresh(packet.observedAt))add('BLOCKED','STALE_OR_INVALID_SNAPSHOT');
 if(typeof packet.schemaHash!=='string'||!/^[a-f0-9]{32}$/.test(packet.schemaHash))add('BLOCKED','MISSING_SCHEMA_FINGERPRINT');
 let prefix;
 try{prefix=reconcilePrefix(readFourteenPackage(release),packet.ledger).prefix;add('VERIFIED','EXACT_LOCAL_PACKAGE_LEDGER_COMPARISON');}
 catch{add('BLOCKED','LEDGER_GAP_UNKNOWN_OR_PAYLOAD_DRIFT');}
 if(prefix!==undefined){
  const expected=expectedCriticalFunctions(prefix);
  if(!Array.isArray(packet.functions)||packet.functions.length!==expected.length||new Set(packet.functions.map(f=>f?.signature)).size!==expected.length)add('BLOCKED','INCOMPLETE_FUNCTION_SNAPSHOT');
  else for(const e of expected){
   const actual=packet.functions.find(f=>f?.signature===e.signature);
   if(e.absent){if(actual?.absent!==true)add('BLOCKED','UNRECORDED_FUTURE_FUNCTION');}
   else{
    if(!actual||actual.absent===true||actual.bodyMd5!==e.bodyMd5||actual.securityDefiner!==e.securityDefiner||JSON.stringify(actual.config)!==JSON.stringify(e.config)||actual.owner!==packet.executorRole||!['postgres','vetit_test_admin'].includes(packet.executorRole))add('BLOCKED','CRITICAL_FUNCTION_BODY_OWNER_OR_SECURITY_DRIFT');
    if(!['anon','authenticated','service_role'].every(r=>typeof actual?.execute?.[r]==='boolean'))add('BLOCKED','INCOMPLETE_FUNCTION_EXECUTE_GRANTS');
    else if(/^public\.(create_seller_business|save_seller_product|submit_seller_product|ensure_my_profile)\(/.test(e.signature)){
     if(actual.execute.anon||!actual.execute.authenticated)add('BLOCKED','AUTHENTICATED_RPC_EXECUTE_GRANT_DRIFT');
     if(actual.execute.service_role)add('PENDING','SERVICE_ROLE_RPC_EXECUTE_REVIEW');
    }
   }
  }
 }
 const tables=packet.tables;
 const roles=['anon','authenticated','service_role'];
 const privileges=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
 if(!Array.isArray(tables)||!tables.every(t=>t&&typeof t.name==='string'&&/^[a-z_]+$/.test(t.name))||new Set(tables.map(t=>t.name)).size!==tables.length||prefix===undefined||JSON.stringify(tables.map(t=>t.name).sort())!==JSON.stringify(expectedPublicTables(prefix)))add('BLOCKED','INCOMPLETE_TABLE_SNAPSHOT');
 else{
  for(const t of tables){
   if(t.rls!==true)add('BLOCKED','PUBLIC_TABLE_WITHOUT_RLS');
   if(!roles.every(r=>Array.isArray(t.grants?.[r])&&new Set(t.grants[r]).size===t.grants[r].length&&t.grants[r].every(p=>privileges.includes(p)))){add('BLOCKED','INCOMPLETE_EFFECTIVE_GRANTS');continue;}
   if(['anon','authenticated'].some(r=>t.grants[r].some(p=>!['SELECT','INSERT','UPDATE','DELETE'].includes(p))))add('BLOCKED','CLIENT_NON_CRUD_PRIVILEGES');
   if(t.grants.service_role.some(p=>!['SELECT','INSERT','UPDATE','DELETE'].includes(p)))add('PENDING','SERVICE_ROLE_NON_CRUD_REVIEW');
  }
  const events=tables.find(t=>t.name==='fulfilment_events');
  if(prefix!==undefined&&prefix<3&&events)add('BLOCKED','UNRECORDED_FULFILMENT_EVENTS');
  if(prefix>=3&&(!events||JSON.stringify(events.grants?.anon)!=='[]'||JSON.stringify(events.grants?.authenticated)!=='["SELECT"]'))add('BLOCKED','FULFILMENT_EVENTS_EXPLICIT_GRANT_DRIFT');
 }
 if(!packet.counts||!prerequisiteCounts.every(name=>typeof packet.counts[name]==='string'&&/^(0|[1-9]\d*)$/.test(packet.counts[name])))add('BLOCKED','MISSING_AGGREGATE_PREREQUISITES');
 else if(prerequisiteCounts.some(name=>packet.counts[name]!=='0'))add('BLOCKED','DATA_CONFLICT_OR_HOLD_REVIEW_REQUIRED');
 else add('VERIFIED','AGGREGATE_PREREQUISITES_ZERO_IN_PACKET');
 try{requireBackup(packet.backup,now);add('PENDING','BACKUP_METADATA_VALID_PROVENANCE_REVIEW_REQUIRED');}
 catch{add('BLOCKED','RECENT_BACKUP_RESTORE_METADATA_REQUIRED');}
 // Never promote supplied JSON into live/hosted certification, even if every structural check passes.
 add('PENDING','POLICY_EXPRESSIONS_AUTH_ROLE_AND_SESSION_ACCEPTANCE');
 add('PENDING','STORAGE_OBJECT_RECOVERY_AND_BACKUP_AUTHENTICITY');
 add('APPROVAL REQUIRED','HOSTED_READ_ONLY_CAPTURE_AND_ANY_LATER_EXECUTION');
 return{format:1,scope:'offline-evidence-comparison-only',prefix:prefix??null,hostedExecutionApproved:false,blockingFindings:[...new Set(findings.filter(f=>f.status==='BLOCKED').map(f=>f.code))],findings:[...new Map(findings.map(f=>[f.status+f.code,f])).values()]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node scripts/test-prerequisite-review.mjs <private-metadata-packet.json>; offline only');
 const bytes=fs.readFileSync(process.argv[2]);
 if(bytes.length>2*1024*1024)throw Error('Metadata packet exceeds review limit');
 // Do not echo packet values, function bodies, database names, paths or credentials.
 let packet;try{packet=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid metadata JSON; input is not displayed');}
 const report=reviewTestPrerequisites(packet);
 console.log(JSON.stringify(report,null,2));
 process.exitCode=report.blockingFindings.length?1:2; // 2 = pending human/hosted verification, never release approval.
}
