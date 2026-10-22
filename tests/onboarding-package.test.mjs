import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyOnboardingPackage} from '../scripts/verify-onboarding-package.mjs';
const root=fileURLToPath(new URL('../supabase/test-project/releases/vetit-onboarding-20261022-r1/',import.meta.url));
test('real package is hash-bound, separately reversible and never execution-ready',()=>{
 assert.deepEqual(verifyOnboardingPackage(root),{version:'20261022015321',payloadsVerified:2,executionReady:false,expectedPredecessors:18});
});
test('packaging preserves all four tested function bodies so prior concurrency evidence remains applicable',()=>{
 const bodies=sql=>[...sql.replace(/\r\n/g,'\n').matchAll(/create or replace function ([\w.]+)\([^]*?as \$\$([^]*?)\$\$;/g)].map(m=>[m[1],m[2]]);
 const source=fs.readFileSync(new URL('../supabase/test-project/development/seller-onboarding-v2.proposal.sql',import.meta.url),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const migration=fs.readFileSync(path.join(root,manifest.entries[0].path),'utf8');
 assert.equal(bodies(source).length,4);assert.deepEqual(bodies(migration),bodies(source));
});
test('altered bytes, target, readiness, execution paths, ledger or extra migrations fail closed',()=>{
 for(const change of ['bytes','target','ready','path','ledger','extra']){
  const copy=fs.mkdtempSync(path.join(os.tmpdir(),'vetit-onboarding-package-'));fs.cpSync(root,copy,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(copy,'manifest.json'),'utf8'));
  if(change==='bytes')fs.appendFileSync(path.join(copy,manifest.entries[0].path),'-- changed\n');
  if(change==='target')manifest.targetProject='another-project';
  if(change==='ready')manifest.executionReady=true;
  if(change==='path')manifest.entries[0].path='../outside.sql';
  if(change==='ledger')manifest.expectedLedgerBefore[0]='20990101000000';
  if(change==='extra')fs.writeFileSync(path.join(copy,'supabase/migrations/unreviewed.sql'),'select 1;');
  fs.writeFileSync(path.join(copy,'manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>verifyOnboardingPackage(copy));
  // Keep isolated temporary fixtures; no recovery/project files are deleted.
 }
});
