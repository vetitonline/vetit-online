import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessProviderSandboxReadiness} from '../scripts/assess-provider-sandbox-readiness.mjs';
import {assessFingerprintBundle} from '../scripts/assess-fingerprint-bundle.mjs';
test('provider readiness cannot approve live operation or hosted execution even if declarations are complete',async()=>{
 const plan=JSON.parse(await readFile(new URL('../docs/provider-sandbox-readiness.example.json',import.meta.url),'utf8'));assert.equal(assessProviderSandboxReadiness(plan).declaredCapabilitiesComplete,false);for(const provider of Object.values(plan.providers))for(const key of Object.keys(provider))provider[key]=true;const report=assessProviderSandboxReadiness(plan);assert.equal(report.declaredCapabilitiesComplete,true);assert.equal(report.providerRuntimeVerified,false);assert.equal(report.hostedExecutionAuthorized,false);assert.equal(report.liveOperationAuthorized,false);
});
test('credential-bearing or live-mode plans are rejected without reflecting secrets',async()=>{
 const plan=JSON.parse(await readFile(new URL('../docs/provider-sandbox-readiness.example.json',import.meta.url),'utf8'));plan.providers.payment.secret='DO_NOT_PRINT';assert.throws(()=>assessProviderSandboxReadiness(plan),error=>!error.message.includes('DO_NOT_PRINT'));assert.throws(()=>assessProviderSandboxReadiness({...plan,mode:'live'}));
});
test('source map evidence detects nested tooling paths without claiming an advisory fix',()=>{
 const report=assessFingerprintBundle([{sections:[{map:{sources:['/project/node_modules/.pnpm/minimatch@10/node_modules/minimatch/dist/index.js','C:\\project\\node_modules\\@expo\\fingerprint\\build\\Options.js']}}]}]);assert.deepEqual(report.packagesFound,['@expo/fingerprint','minimatch']);assert.equal(report.advisoryResolved,false);assert.equal(report.upgradeAuthorized,false);const absent=assessFingerprintBundle([{sources:['/project/mobile/App.tsx']}]);assert.equal(absent.packagesFound.length,0);assert.equal(absent.allRuntimeReachabilityVerified,false);
});
test('malformed source maps fail and fingerprint ignore patterns stay short without excluding app assets',async()=>{
 assert.throws(()=>assessFingerprintBundle([]));assert.throws(()=>assessFingerprintBundle([{sources:[{}]}]));const file=await readFile(new URL('../mobile/.fingerprintignore',import.meta.url),'utf8');const patterns=file.split('\n').filter(line=>line&&!line.startsWith('#'));assert.ok(patterns.every(line=>line.length<100));assert.ok(!patterns.some(line=>line.includes('assets')||line.includes('app.json')));
});
