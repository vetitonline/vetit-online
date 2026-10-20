import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyModerationCandidate} from '../scripts/verify-moderation-candidate.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'vetit-synthetic-candidate-'));await mkdir(path.join(dir,'pending'));
 const config={targetProjectRef:'apfyfmokcynqiaxqvvxx',automaticApprovalEnabled:false,automaticPublicationEnabled:false,policies:[],reviewers:[]};const text=JSON.stringify(config);await writeFile(path.join(dir,'configuration-request.json'),text);
 const entries=[];for(let i=1;i<=11;i++){const version=String(20261019000000+i),name='synthetic_'+i,candidatePath=`pending/${String(i).padStart(2,'0')}-${version}_${name}.sql`,body='-- Synthetic verifier fixture. Never executed.\n';await writeFile(path.join(dir,candidatePath),body);entries.push({order:i,version,name,candidatePath,sha256:hash(body)});}
 const manifest={targetProjectRef:config.targetProjectRef,hostedExecutionApproved:false,hostedApplied:false,configurationApproved:false,automationActivationApproved:false,ledgerReconciliationApproved:false,entries,historicalPrerequisites:Array.from({length:4},()=>({action:'VERIFY-EXISTING-NEVER-REPLAY'})),configurationSha256:hash(text)};
 const save=()=>writeFile(path.join(dir,'approval-manifest.json'),JSON.stringify(manifest));await save();return{dir,manifest,save};
}
test('offline verifier accepts bounded unapproved package and rejects changed SQL bytes',async()=>{
 const f=await fixture();assert.equal((await verifyModerationCandidate(f.dir)).pendingSqlFiles,11);await writeFile(path.join(f.dir,f.manifest.entries[0].candidatePath),'-- changed synthetic bytes');await assert.rejects(verifyModerationCandidate(f.dir),/checksum/);
});
test('offline verifier rejects wrong project and unsafe order/path metadata',async()=>{
 const f=await fixture();f.manifest.targetProjectRef='different-project';await f.save();await assert.rejects(verifyModerationCandidate(f.dir));f.manifest.targetProjectRef='apfyfmokcynqiaxqvvxx';f.manifest.entries[0].candidatePath='../outside.sql';await f.save();await assert.rejects(verifyModerationCandidate(f.dir),/order or checksum/);
});
test('offline verifier refuses automation configuration even if its new hash matches',async()=>{
 const f=await fixture();const config=JSON.parse(await readFile(path.join(f.dir,'configuration-request.json'),'utf8'));config.automaticApprovalEnabled=true;const bytes=JSON.stringify(config);await writeFile(path.join(f.dir,'configuration-request.json'),bytes);f.manifest.configurationSha256=hash(bytes);await f.save();await assert.rejects(verifyModerationCandidate(f.dir),/Configuration/);
});
