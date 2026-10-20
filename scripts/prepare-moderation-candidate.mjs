// Offline packaging only. No database, CLI deployment, environment or credentials.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const target='apfyfmokcynqiaxqvvxx';
function within(base,relative){const resolved=path.resolve(base,relative);if(!relative||path.isAbsolute(relative)||!resolved.startsWith(path.resolve(base)+path.sep))throw Error('Candidate path escapes source root.');return resolved;}
export async function prepareModerationCandidate(originalCandidate,newDirectory){
 const old=await json(path.join(originalCandidate,'release-manifest.json'));
 if(old.target!==target||old.hostedExecutionApproved!==false||old.additive?.length!==6||old.historicalAliases?.length!==4)throw Error('Expected the unapproved original six-step Test candidate.');
 const sources=[];
 for(const row of [...old.historicalAliases,...old.additive]){
  const bytes=await readFile(within(root,row.path));
  if(hash(bytes)!==row.sha256||hash(await readFile(within(originalCandidate,row.candidatePath)))!==row.sha256)throw Error('Original release source/candidate drift: '+row.path);
  if(row.order)sources.push({...row,order:row.order,version:row.releaseVersion,name:row.releaseName,bytes});
 }
 const resubmission=await json(path.join(root,'supabase/test-project/release-corrections/resubmission-release.json'));
 const durable=await json(path.join(root,'supabase/test-project/release-corrections/durable-moderation-release.json'));
 const automatic=await json(path.join(root,'supabase/test-project/release-corrections/automatic-moderation-release.json'));
 if(resubmission.target!==target||durable.targetProjectRef!==target||automatic.targetProjectRef!==target||durable.hostedApplied!==false||automatic.hostedApplied!==false)throw Error('Supplemental target/status mismatch.');
 const readme=await readFile(path.join(root,'supabase/test-project/migrations/README.md'),'utf8');
 const queueHash=readme.match(/step \*\*8\*\*:[\s\S]*?SHA256: `([a-f0-9]{64})`/)?.[1];
 if(!queueHash)throw Error('Queue checksum record unavailable.');
 const rows=[{order:7,path:resubmission.migrationPath,sha256:resubmission.sha256},{order:8,path:'supabase/test-project/migrations/20261019100841_vetit_admin_listing_queue.sql',sha256:queueHash},{order:9,path:durable.path,sha256:durable.sha256},...automatic.migrations.map(r=>({...r,order:r.releaseOrder}))];
 for(const row of rows){const bytes=await readFile(within(root,row.path));if(hash(bytes)!==row.sha256)throw Error('Supplemental source drift: '+row.path);const match=path.basename(row.path).match(/^(\d{14})_(.+)\.sql$/);if(!match)throw Error('Missing generated migration version.');sources.push({...row,version:match[1],name:match[2],bytes});}
 sources.sort((a,b)=>a.order-b.order);
 if(sources.length!==11||sources.some((r,i)=>r.order!==i+1||!/^\d{14}$/.test(r.version))||new Set(sources.map(r=>r.version)).size!==11||sources.some((r,i)=>i&&r.version<=sources[i-1].version))throw Error('Invalid migration order.');
 // Validate every byte before creating the new directory. Never overwrite.
 await mkdir(newDirectory,{recursive:false});
 await mkdir(path.join(newDirectory,'pending'));
 const entries=[];
 for(const row of sources){const candidatePath=`pending/${String(row.order).padStart(2,'0')}-${row.version}_${row.name}.sql`;await writeFile(path.join(newDirectory,candidatePath),row.bytes,{flag:'wx'});entries.push({order:row.order,version:row.version,name:row.name,sourcePath:row.path,candidatePath,sha256:row.sha256,requires:row.order===1?'reviewed existing foundation':`step ${row.order-1}`,status:'PREPARED-NOT-HOSTED-APPLIED'});}
 const configuration={status:'OWNER-POLICY-REVIEW-REQUIRED-NOT-EXECUTABLE',targetProjectRef:target,automaticApprovalEnabled:false,automaticPublicationEnabled:false,policies:[],reviewers:[],requiredPolicyFields:['version','subject_kind','market','category_id (listing only)','business_type (seller only)','classification','automatic_eligible=false'],requiredReviewerFields:['existing verified profile_id','enabled explicitly approved','trusted app_metadata.vetit_admin=true'],requirements:['No customer identities or real policy classifications are inferred.','Policy versions are immutable; choose approved operational versions and scopes.','Restricted/live-animal/veterinary listings require human review.','Only the database owner provisions private reviewer grants; client metadata never grants access.','Trusted providers and content data sharing require separate approval.','No auth metadata, policy rows or reviewer grants are changed by this package.']};
 await writeFile(path.join(newDirectory,'configuration-request.json'),JSON.stringify(configuration,null,2),{flag:'wx'});
 const manifest={candidateId:'vetit-moderation-2026.10.19-review',targetProjectRef:target,hostedExecutionApproved:false,hostedApplied:false,ledgerReconciliationApproved:false,automationActivationApproved:false,configurationApproved:false,historicalPrerequisites:old.historicalAliases.map(({bytes,...r})=>({...r,action:'VERIFY-EXISTING-NEVER-REPLAY'})),entries,configurationSha256:hash(await readFile(path.join(newDirectory,'configuration-request.json'))),executionMethod:'Not supplied: approve exact ledger/schema comparison and execution method before any hosted mutation.',evidence:'Reuse existing local rollback/RLS/concurrency/audit results; packaging verification is not a database test.'};
 await writeFile(path.join(newDirectory,'approval-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 await writeFile(path.join(newDirectory,'README.txt'),'APPROVAL REVIEW ONLY. All 11 files preserve source bytes. Historical prerequisites must already exist and must never be replayed. Do not db push, concatenate scripts, execute old six-file wrappers, repair history, enable automation, or seed reviewer/policy configuration from this directory. Per-step SQL has its original transaction boundaries. Runtime schema/ledger comparison, exact migration execution/ledger method, operational policy and reviewers, providers/data sharing, and bounded synthetic hosted Test acceptance need explicit approval. No automatic executor or operational configuration seeds are included. Reuse existing verified backup/recovery evidence. No reverse/destructive rollback script is supplied; stop on failure and use a separately approved forward correction/recovery procedure.\n',{flag:'wx'});
 return {files:entries.length,hostedExecuted:false,configurationApproved:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{if(process.argv.length!==4)throw Error('Provide original candidate and new output directories.');console.log(JSON.stringify(await prepareModerationCandidate(path.resolve(process.argv[2]),path.resolve(process.argv[3]))));}catch(error){console.error(error.message);process.exitCode=1;}}
