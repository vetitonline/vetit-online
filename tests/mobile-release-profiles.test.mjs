import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessMobileReleaseReadiness} from '../scripts/check-mobile-release-readiness.mjs';
test('approved app identities and valid local build counters are configured',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../mobile/app.json',import.meta.url),'utf8'));assert.equal(manifest.expo.ios.bundleIdentifier,'com.vetitonline.app');assert.equal(manifest.expo.android.package,'com.vetitonline.app');assert.match(manifest.expo.ios.buildNumber,/^[1-9]\d*(?:\.\d+){0,2}$/);assert.ok(Number.isSafeInteger(manifest.expo.android.versionCode)&&manifest.expo.android.versionCode>0);const report=assessMobileReleaseReadiness(manifest);assert.ok(!report.blockers.includes('IOS_BUNDLE_IDENTIFIER_REQUIRED'));assert.ok(!report.blockers.includes('ANDROID_APPLICATION_ID_REQUIRED'));assert.equal(report.storeSubmissionAuthorized,false);
});
test('build profiles require local credentials and a committed tree, without auto-submission',async()=>{
 const config=JSON.parse(await readFile(new URL('../mobile/eas.json',import.meta.url),'utf8'));assert.equal(config.cli.requireCommit,true);assert.equal(config.cli.appVersionSource,'local');assert.equal(config.build.base.credentialsSource,'local');assert.equal(config.build.internal.extends,'base');assert.equal(config.build.internal.distribution,'internal');assert.equal(config.build['release-candidate'].distribution,'store');assert.equal(config.build['release-candidate'].extends,'base');assert.equal(config.submit,undefined);assert.equal(config.build['release-candidate'].autoIncrement,undefined);
});
