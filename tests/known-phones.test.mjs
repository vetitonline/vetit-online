import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessKnownPhones,createKnownPhoneRecord} from '../scripts/prepare-known-phones.mjs';
import {assessDeviceAcceptance} from '../scripts/device-acceptance.mjs';
test('known public phone models are prepared with user-reported Android OS without claiming verified installation',()=>{
 const report=assessKnownPhones();assert.equal(report.computerOs,'Windows');assert.equal(report.appleDeveloperAccountAvailable,true);assert.match(report.devices[0].model,/Galaxy A15/);assert.equal(report.devices[0].reportedOsVersion,'16');assert.equal(report.devices[0].aboveFrameworkFloor,true);assert.equal(report.devices[1].reportedOsVersion,'27.2.1');assert.equal(report.devices[1].aboveFrameworkFloor,true);assert.equal(report.officialClientAvailabilityVerified,false);assert.equal(report.physicalDeviceAcceptanceVerified,false);assert.ok(report.devices.every(device=>device.installationVerified===false));
});
test('framework floor checks and SDK declarations do not authorize signing, hosted operations or store submission',()=>{
 assert.equal(assessKnownPhones({androidVersion:'6'}).devices[0].aboveFrameworkFloor,false);const report=assessKnownPhones({androidVersion:'14',expoGoSdkMajor:57});assert.equal(report.devices[0].aboveFrameworkFloor,true);assert.equal(report.expoGoSdkDeclarationMatches,true);assert.equal(report.signingAuthorized,false);assert.equal(report.hostedExecutionAuthorized,false);assert.equal(report.storeSubmissionAuthorized,false);assert.equal(assessKnownPhones({expoGoSdkMajor:58}).expoGoSdkDeclarationMatches,false);
});
test('device record contains model/OS only and no fabricated device acceptance',()=>{
 const record=createKnownPhoneRecord('a'.repeat(40));assert.equal(record.devices[0].osVersion,'16');assert.equal(record.devices[1].osVersion,'27.2.1');for(const device of record.devices){assert.deepEqual(Object.keys(device).sort(),['platform','model','osVersion','physicalDevice','buildKind','buildCommit','cases'].sort());assert.ok(device.cases.every(item=>item.status==='not_run'));assert.equal(device.buildCommit,'');}assert.equal(assessDeviceAcceptance(record).declaredEvidenceComplete,false);
 const known=createKnownPhoneRecord('a'.repeat(40),{androidVersion:'15'});assert.equal(known.devices[0].osVersion,'15');assert.throws(()=>assessKnownPhones({androidVersion:'not a version'}));
});
test('compatibility hints stay tied to the current installed native framework sources',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../mobile/package.json',import.meta.url),'utf8'));assert.equal(pkg.dependencies['react-native'],'0.86.3');assert.match(pkg.dependencies.expo,/57\./);const ios=await readFile(new URL('../mobile/node_modules/react-native/scripts/cocoapods/helpers.rb',import.meta.url),'utf8');assert.match(ios,/def self.min_ios_version_supported\s+return '15\.1'/);const android=await readFile(new URL('../mobile/node_modules/react-native/ReactAndroid/src/main/AndroidManifest.xml',import.meta.url),'utf8');assert.match(android,/android:minSdkVersion="24"/);
});
