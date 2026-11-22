import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectStoreIconPng,assessMobileIcon} from '../scripts/mobile-icon-readiness.mjs';
import {assessMobileSigningReadiness} from '../scripts/check-mobile-signing-readiness.mjs';
test('configured app/adaptive icon is square opaque PNG and the original logo remains unchanged',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../mobile/app.json',import.meta.url),'utf8'));assert.equal(manifest.expo.icon,manifest.expo.android.adaptiveIcon.foregroundImage);const report=await assessMobileIcon(manifest,fileURLToPath(new URL('../mobile/',import.meta.url)));assert.equal(report.iconSourceVerified,true);assert.equal(report.icon.width,report.icon.height);assert.ok(report.icon.width>=1024);assert.equal(report.icon.opaque,true);assert.equal(report.icon.storeSubmissionAuthorized,false);const original=await readFile(new URL('../Vetit-online-transparent.png',import.meta.url));assert.equal(original.readUInt32BE(16),700);assert.equal(original.readUInt32BE(20),476);
});
test('icon checks reject corrupt, truncated, non-square and outside-project sources',async()=>{
 const bytes=await readFile(new URL('../mobile/assets/app-icon.png',import.meta.url));const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;assert.throws(()=>inspectStoreIconPng(corrupt));assert.throws(()=>inspectStoreIconPng(bytes.subarray(0,40)));assert.throws(()=>inspectStoreIconPng(Buffer.from('not png')));assert.throws(()=>inspectStoreIconPng(awaitedOriginal));
 const report=await assessMobileIcon({expo:{icon:'../Vetit-online-transparent.png'}},fileURLToPath(new URL('../mobile/',import.meta.url)));assert.equal(report.iconSourceVerified,false);
});
const awaitedOriginal=await readFile(new URL('../Vetit-online-transparent.png',import.meta.url));
test('placeholder signing template stays blocked without disclosing supplied values',async()=>{
 const config=JSON.parse(await readFile(new URL('../mobile/credentials.example.json',import.meta.url),'utf8'));const report=assessMobileSigningReadiness(config);assert.equal(report.configurationComplete,false);assert.equal(report.signingAuthorized,false);assert.equal(JSON.stringify(report).includes('REPLACE_LOCALLY'),false);
 const supplied={android:{keystore:{keystorePath:'private.jks',keystorePassword:'SYNTHETIC_SECRET_A',keyAlias:'synthetic',keyPassword:'SYNTHETIC_SECRET_B'}},ios:{provisioningProfilePath:'private.mobileprovision',distributionCertificate:{path:'private.p12',password:'SYNTHETIC_SECRET_C'}}};const checked=assessMobileSigningReadiness(supplied);assert.equal(checked.configurationComplete,true);assert.equal(checked.credentialsVerified,false);assert.equal(checked.signingAuthorized,false);assert.equal(JSON.stringify(checked).includes('SYNTHETIC_SECRET'),false);
});
test('private signing paths are ignored while the example template remains reviewable',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));const paths=['mobile/credentials.json','mobile/credentials/android/release.keystore','mobile/private.p12','mobile/private.mobileprovision','mobile/private.p8'];const output=execFileSync('git',['check-ignore','--no-index','--stdin'],{cwd:root,input:paths.join('\n')+'\n',encoding:'utf8'});assert.deepEqual(output.trim().split('\n'),paths);
 assert.throws(()=>execFileSync('git',['check-ignore','--quiet','mobile/credentials.example.json'],{cwd:root}));
});
