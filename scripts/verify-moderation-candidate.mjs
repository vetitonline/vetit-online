import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyModerationCandidate(directory){
 const bytes=await readFile(path.join(directory,'approval-manifest.json'));
 const m=JSON.parse(bytes.toString('utf8'));
 if(m.targetProjectRef!=='apfyfmokcynqiaxqvvxx'||m.hostedExecutionApproved!==false||m.hostedApplied!==false||m.configurationApproved!==false||m.automationActivationApproved!==false||m.ledgerReconciliationApproved!==false||m.entries?.length!==11||m.historicalPrerequisites?.length!==4)throw Error('Unapproved candidate metadata required.');
 if(new Set(m.entries.map(r=>r.version)).size!==11||m.historicalPrerequisites.some(r=>r.action!=='VERIFY-EXISTING-NEVER-REPLAY'))throw Error('History/order mismatch.');
 const files=await readdir(path.join(directory,'pending'));
 if(files.length!==11)throw Error('Unexpected pending candidate contents.');
 for(const [i,row] of m.entries.entries()){
  if(row.order!==i+1||!/^\d{14}$/.test(row.version)||i&&row.version<=m.entries[i-1].version||row.candidatePath!==`pending/${String(i+1).padStart(2,'0')}-${row.version}_${row.name}.sql`||!/^[a-z0-9_]+$/.test(row.name)||hash(await readFile(path.join(directory,row.candidatePath)))!==row.sha256)throw Error('Candidate order or checksum mismatch.');
 }
 const configBytes=await readFile(path.join(directory,'configuration-request.json'));const config=JSON.parse(configBytes.toString('utf8'));
 if(hash(configBytes)!==m.configurationSha256||config.targetProjectRef!==m.targetProjectRef||config.automaticApprovalEnabled!==false||config.automaticPublicationEnabled!==false||config.policies?.length!==0||config.reviewers?.length!==0)throw Error('Configuration requires review; no seeded grants permitted.');
 return{pendingSqlFiles:11,historicalPrerequisites:4,configuration:'UNAPPROVED-UNSEEDED',manifestSha256:hash(bytes),databaseAccessed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{if(process.argv.length!==3)throw Error('Provide candidate directory.');console.log(JSON.stringify(await verifyModerationCandidate(path.resolve(process.argv[2]))));}catch(error){console.error(error.message);process.exitCode=1;}}
