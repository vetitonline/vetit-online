import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
/** Offline manifest inspection only. No credentials, signing, networking or build upload. */
export function assessMobileReleaseReadiness(manifest){
 const config=manifest?.expo;
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid Expo release manifest.');
 const blockers=[];
 if(typeof config.name!=='string'||!config.name.trim())blockers.push('APP_NAME_REQUIRED');
 if(typeof config.version!=='string'||!/^\d+\.\d+\.\d+$/.test(config.version))blockers.push('RELEASE_VERSION_REQUIRED');
 if(config.scheme!=='vetit'&&!(Array.isArray(config.scheme)&&config.scheme.includes('vetit')))blockers.push('VETIT_SCHEME_REQUIRED');
 if(typeof config.ios?.bundleIdentifier!=='string'||! /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+$/.test(config.ios.bundleIdentifier))blockers.push('IOS_BUNDLE_IDENTIFIER_REQUIRED');
 if(typeof config.ios?.buildNumber!=='string'||! /^[1-9]\d*(?:\.\d+){0,2}$/.test(config.ios.buildNumber))blockers.push('IOS_BUILD_NUMBER_REQUIRED');
 if(typeof config.android?.package!=='string'||! /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(config.android.package))blockers.push('ANDROID_APPLICATION_ID_REQUIRED');
 if(!Number.isInteger(config.android?.versionCode)||config.android.versionCode<1||config.android.versionCode>2100000000)blockers.push('ANDROID_VERSION_CODE_REQUIRED');
 if(typeof config.icon!=='string'||!config.icon.trim())blockers.push('STORE_ICON_CONFIGURATION_REQUIRED');
 return{manifestValid:true,localConfigurationComplete:blockers.length===0,blockers,requiredExternalChecks:['APP_IDENTITIES_AND_SIGNING_APPROVED','HOSTED_SYNTHETIC_ACCEPTANCE_APPROVED','ANDROID_PHYSICAL_DEVICE_ACCEPTANCE','IOS_PHYSICAL_DEVICE_ACCEPTANCE','STORE_PRIVACY_AND_DATA_SAFETY_REVIEW','NOTIFICATION_PERMISSION_AND_DELIVERY_ACCEPTANCE'],runtimeVerified:false,storeSubmissionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const manifest=JSON.parse(await readFile(new URL('../mobile/app.json',import.meta.url),'utf8'));
 process.stdout.write(JSON.stringify(assessMobileReleaseReadiness(manifest),null,2)+'\n');
}
