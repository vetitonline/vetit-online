import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessFingerprintInputs} from '../scripts/check-fingerprint-inputs.mjs';
test('reviewed short repository patterns pass while the upstream advisory stays open',async()=>{const text=await readFile(new URL('../mobile/.fingerprintignore',import.meta.url),'utf8');const report=assessFingerprintInputs(text);assert.equal(report.projectInputsWithinPolicy,true);assert.equal(report.advisoryResolved,false);assert.equal(report.dependencyPatched,false);assert.equal(report.allFingerprintInputsVerified,false);});
test('complex, excessive and escaping patterns are rejected without running minimatch',()=>{for(const text of ['**/{a,b,c}/**','a'.repeat(257),'../private/**','/absolute/**','***/*.json',Array(129).fill('file').join('\n')])assert.equal(assessFingerprintInputs(text).projectInputsWithinPolicy,false);assert.throws(()=>assessFingerprintInputs('a'.repeat(32769)));});
test('adding dynamic config requires review instead of executing it',()=>{const report=assessFingerprintInputs('credentials/**',{dynamicConfigPresent:true});assert.equal(report.projectInputsWithinPolicy,false);assert.ok(report.blockers.includes('DYNAMIC_FINGERPRINT_CONFIG_REVIEW_REQUIRED'));});
