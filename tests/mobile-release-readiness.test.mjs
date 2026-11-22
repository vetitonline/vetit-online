import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessMobileReleaseReadiness} from '../scripts/check-mobile-release-readiness.mjs';
test('current manifest is inspected without changing config or granting approval',async()=>{
 const file=new URL('../mobile/app.json',import.meta.url),before=await readFile(file,'utf8');const result=assessMobileReleaseReadiness(JSON.parse(before));assert.equal(result.localConfigurationComplete,result.blockers.length===0);assert.equal(result.runtimeVerified,false);assert.equal(result.storeSubmissionAuthorized,false);assert.equal(await readFile(file,'utf8'),before);
});
test('a complete synthetic manifest still cannot claim physical-device or hosted approval',()=>{
 const result=assessMobileReleaseReadiness({expo:{name:'Synthetic',version:'1.0.0',scheme:'vetit',icon:'synthetic.png',ios:{bundleIdentifier:'invalid.synthetic.app',buildNumber:'1'},android:{package:'invalid.synthetic.app',versionCode:1}}});assert.equal(result.localConfigurationComplete,true);assert.equal(result.storeSubmissionAuthorized,false);assert.equal(result.runtimeVerified,false);assert.ok(result.requiredExternalChecks.includes('HOSTED_SYNTHETIC_ACCEPTANCE_APPROVED'));
});
test('invalid identities and version codes fail static readiness',()=>{
 const result=assessMobileReleaseReadiness({expo:{name:'Synthetic',version:'bad',scheme:'other',ios:{bundleIdentifier:'with spaces',buildNumber:'zero'},android:{package:'a/b',versionCode:0}}});assert.ok(result.blockers.includes('ANDROID_APPLICATION_ID_REQUIRED'));assert.ok(result.blockers.includes('IOS_BUNDLE_IDENTIFIER_REQUIRED'));assert.ok(result.blockers.includes('RELEASE_VERSION_REQUIRED'));
});
