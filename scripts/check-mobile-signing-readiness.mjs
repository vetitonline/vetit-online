import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const supplied=value=>typeof value==='string'&&value.trim().length>0&&!/REPLACE|PLACEHOLDER|CHANGEME/i.test(value);
/** Shape assessment only; never prints secrets, verifies passwords or signs. */
export function assessMobileSigningReadiness(config){
 const blockers=[];
 if(!supplied(config?.android?.keystore?.keystorePath))blockers.push('ANDROID_KEYSTORE_PATH_REQUIRED');
 if(!['keystorePassword','keyAlias','keyPassword'].every(key=>supplied(config?.android?.keystore?.[key])))blockers.push('ANDROID_LOCAL_SIGNING_VALUES_REQUIRED');
 if(!supplied(config?.ios?.provisioningProfilePath))blockers.push('IOS_PROVISIONING_PROFILE_REQUIRED');
 if(!supplied(config?.ios?.distributionCertificate?.path)||!supplied(config?.ios?.distributionCertificate?.password))blockers.push('IOS_LOCAL_SIGNING_VALUES_REQUIRED');
 return{configurationComplete:blockers.length===0,blockers,filesVerified:false,credentialsVerified:false,signingAuthorized:false,storeSubmissionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // Default is the public placeholder template, never a private credential file.
 let report;try{const args=process.argv.slice(2);const file=args.length===2&&args[0]==='--file'?args[1]:new URL('../mobile/credentials.example.json',import.meta.url);if(args.length&&!(args.length===2&&args[0]==='--file'))throw Error();report=assessMobileSigningReadiness(JSON.parse(await readFile(file,'utf8')));}catch{report={configurationComplete:false,blockers:['LOCAL_SIGNING_CONFIG_UNAVAILABLE'],credentialsVerified:false,signingAuthorized:false,storeSubmissionAuthorized:false};}
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
