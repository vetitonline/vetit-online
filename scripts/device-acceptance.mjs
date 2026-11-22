import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';
export const DEVICE_CASES=['preview.launch','preview.catalogue_cart','preview.services','preview.artwork_accessibility','native.auth_isolation','native.booking','native.cancellation_rescheduling','native.waitlist_offers','native.notification_readback','native.offline_background','sandbox.checkout_reconciliation','sandbox.delivery_reconciliation','release.install_upgrade'];
export function parseDeviceAcceptanceRecord(text){try{if(typeof text!=='string')throw Error();return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('Invalid device evidence data.');}}
export function createDeviceAcceptanceRecord(commit){
 if(typeof commit!=='string'||! /^[0-9a-f]{40}$/.test(commit))throw Error('A full source commit is required.');
 return{schemaVersion:1,sourceCommit:commit,apiOrigin:'',testApiOrigin:'',hostedApprovalReference:'',nativeHostConfigured:false,devices:['android','ios'].map(platform=>({platform,model:'',osVersion:'',physicalDevice:false,buildKind:'preview',buildCommit:'',cases:DEVICE_CASES.map(id=>({id,status:'not_run',evidenceReference:''}))}))};
}
/** Evidence declarations only. Cannot verify a handset, approve a target or ship. */
export function assessDeviceAcceptance(record){
 if(record?.schemaVersion!==1||typeof record.sourceCommit!=='string'||! /^[0-9a-f]{40}$/.test(record.sourceCommit)||!Array.isArray(record.devices)||record.devices.length!==2)throw Error('Invalid device evidence record.');
 const blockers=[];let origin;
 try{origin=new URL(resolveMobileApiBase(record.apiOrigin,record.testApiOrigin));if(['localhost','127.0.0.1','[::1]'].includes(origin.hostname))blockers.push('PHONE_CANNOT_USE_COMPUTER_LOOPBACK');}catch{blockers.push('EXPLICIT_TEST_ORIGIN_REQUIRED');}
 const seen=new Set();
 for(const device of record.devices){
  if(!['android','ios'].includes(device.platform)||seen.has(device.platform)||!['preview','signed-internal','local-native'].includes(device.buildKind)||!Array.isArray(device.cases)||device.cases.length!==DEVICE_CASES.length)throw Error('Invalid device evidence scope.');seen.add(device.platform);
  const prefix=device.platform.toUpperCase();if(device.physicalDevice!==true||typeof device.model!=='string'||!device.model.trim()||typeof device.osVersion!=='string'||!device.osVersion.trim())blockers.push(prefix+'_PHYSICAL_DEVICE_DETAILS_REQUIRED');
  if(device.buildCommit!==record.sourceCommit)blockers.push(prefix+'_BUILD_COMMIT_MISMATCH');
  const cases=new Set();for(const item of device.cases){if(!DEVICE_CASES.includes(item.id)||cases.has(item.id)||!['not_run','pass','fail','blocked'].includes(item.status)||typeof item.evidenceReference!=='string')throw Error('Invalid device test result.');cases.add(item.id);
   if(item.status!=='pass'||!item.evidenceReference.trim())blockers.push(prefix+'_'+item.id.toUpperCase().replaceAll('.','_')+'_EVIDENCE_REQUIRED');
   if(item.id.startsWith('release.')&&device.buildKind==='preview')blockers.push(prefix+'_SIGNED_INSTALL_EVIDENCE_REQUIRED');
   if((item.id.startsWith('native.')||item.id.startsWith('sandbox.'))&&(device.buildKind==='preview'||record.nativeHostConfigured!==true||typeof record.hostedApprovalReference!=='string'||!record.hostedApprovalReference.trim()||origin?.protocol!=='https:'))blockers.push(prefix+'_AUTHENTICATED_ACCEPTANCE_PREREQUISITES_REQUIRED');
  }
 }
 return{declaredEvidenceComplete:blockers.length===0,blockers:[...new Set(blockers)].sort(),deviceResultsIndependentlyVerified:false,hostedExecutionAuthorized:false,productionApprovalGranted:false,storeSubmissionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args=process.argv.slice(2);let result;if(args.length===1&&args[0]==='--template')result=createDeviceAcceptanceRecord(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());else if(args.length===2&&args[0]==='--file')result=assessDeviceAcceptance(parseDeviceAcceptanceRecord(await readFile(args[1],'utf8')));else throw Error();process.stdout.write(JSON.stringify(result,null,2)+'\n');}catch{process.stderr.write('Device evidence assessment failed; no record contents disclosed.\n');process.exitCode=1;}
}
