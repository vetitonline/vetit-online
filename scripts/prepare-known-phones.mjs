import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createDeviceAcceptanceRecord} from './device-acceptance.mjs';
const version=value=>typeof value==='string'&&/^\d+(?:\.\d+){0,2}$/.test(value)?value.split('.').map(Number):null;
const atLeast=(value,minimum)=>{const parsed=version(value);if(!parsed)return null;for(let i=0;i<minimum.length;i++){if((parsed[i]??0)!==minimum[i])return(parsed[i]??0)>minimum[i];}return true;};
/** Public model/OS metadata only. Never serials, phone numbers, IMEIs or UDIDs. */
export function assessKnownPhones({androidVersion='16',expoGoSdkMajor=null}={}){
 if(androidVersion!==''&&!version(androidVersion))throw Error('Provide only the Android version number.');
 if(expoGoSdkMajor!==null&&(!Number.isInteger(expoGoSdkMajor)||expoGoSdkMajor<1))throw Error('Invalid Expo Go SDK declaration.');
 return{computerOs:'Windows',appleDeveloperAccountAvailable:true,projectExpoSdkMajor:57,frameworkSource:'React Native 0.86.3 installed-source lower bounds; final Expo/client/build requirements may be higher',devices:[
  {platform:'android',model:'Samsung Galaxy A15 (SM-A155F/DSN)',reportedOsVersion:androidVersion||null,frameworkMinimumHint:'Android 7 / API 24',aboveFrameworkFloor:atLeast(androidVersion,[7]),recommendedRoute:expoGoSdkMajor===57?'SDK-matched Expo Go public preview':'Check official SDK-57 Expo Go availability; otherwise approved internal APK',installationVerified:false},
  {platform:'ios',model:'Apple iPhone 16 Pro Max (iPhone17,2)',reportedOsVersion:'27.2.1',frameworkMinimumHint:'iOS 15.1',aboveFrameworkFloor:atLeast('27.2.1',[15,1]),recommendedRoute:expoGoSdkMajor===57?'SDK-matched Expo Go public preview':'Check installed Expo Go SDK; otherwise approved signed physical-iPhone build',installationVerified:false}
 ],expoGoSdkDeclarationMatches:expoGoSdkMajor===null?null:expoGoSdkMajor===57,officialClientAvailabilityVerified:false,physicalDeviceAcceptanceVerified:false,signingAuthorized:false,hostedExecutionAuthorized:false,storeSubmissionAuthorized:false};
}
export function createKnownPhoneRecord(commit,{androidVersion='16'}={}){
 const assessment=assessKnownPhones({androidVersion}),record=createDeviceAcceptanceRecord(commit);
 for(const device of record.devices){const known=assessment.devices.find(row=>row.platform===device.platform);device.model=known.model;device.osVersion=known.reportedOsVersion??'';device.physicalDevice=true;}
 return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args=process.argv.slice(2);let androidVersion='16',record=false;for(let i=0;i<args.length;i++){if(args[i]==='--android-version'&&args[i+1])androidVersion=args[++i];else if(args[i]==='--record')record=true;else throw Error();}const output=record?createKnownPhoneRecord(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),{androidVersion}):assessKnownPhones({androidVersion});process.stdout.write(JSON.stringify(output,null,2)+'\n');}catch{process.stderr.write('Phone preparation failed. Supply only version numbers, not personal identifiers.\n');process.exitCode=1;}
}
