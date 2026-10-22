import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readCataloguePackage,buildCataloguePlan} from '../scripts/catalogue-release-plan.mjs';
const root='supabase/test-project/releases/vetit-catalogue-20261022-r1';
const now=Date.parse('2026-10-22T16:00:00Z');
const backup={projectId:'apfyfmokcynqiaxqvvxx',verified:true,successfulAt:'2026-10-22T15:00:00Z',inspectedAt:'2026-10-22T15:30:00Z',retentionHours:24,evidenceRef:'SYNTHETIC UNIT TEST ONLY',restoreProcedureRef:'SYNTHETIC UNIT TEST ONLY'};
const options={backup,executorRole:'vetit_test_admin',now};
test('frozen package binds 19 predecessors, hardened functions and separate apply/pause bytes',()=>{
 const {manifest,payloads,core,functions}=readCataloguePackage(root);
 assert.equal(manifest.foundationPreserve.length,4);assert.equal(manifest.prerequisites.length,15);
 assert.equal(manifest.preFunctionChecks.length,9);assert.equal(functions.length,7);
 assert.equal(core.md5,manifest.preFunctionChecks[0].md5);
 assert.equal(manifest.prerequisites[13].version,'20261021133642'); // Profile already included.
 assert.ok(payloads.apply.includes('grant select(catalogue_revision)'));
 assert.match(payloads.pause,/vetit_catalogue_paused/);
 assert.equal(manifest.executionReady,false);
});
test('wrong identity, reordered dependencies, changed functions and extra migrations fail closed',()=>{
 for(const mutate of [m=>{m.targetProject='production';},m=>{m.prerequisites.reverse();},m=>{m.foundationPreserve.pop();},m=>{m.preFunctionChecks[0].md5='0'.repeat(32);},m=>{m.entries[0].path='../outside.sql';},m=>{m.executionReady=true;},m=>{m.sourceCommit='0'.repeat(40);}]){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vetit-package-invalid-'));
  fs.cpSync(root,tmp,{recursive:true});const m=JSON.parse(fs.readFileSync(path.join(tmp,'manifest.json'),'utf8'));mutate(m);fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify(m));assert.throws(()=>readCataloguePackage(tmp));
 }
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vetit-package-payload-'));fs.cpSync(root,tmp,{recursive:true});
 const m=JSON.parse(fs.readFileSync(path.join(tmp,'manifest.json'),'utf8'));fs.appendFileSync(path.join(tmp,m.entries[0].path),'\n-- drift\n');assert.throws(()=>readCataloguePackage(tmp),/checksum/);
 const extra=fs.mkdtempSync(path.join(os.tmpdir(),'vetit-package-extra-'));fs.cpSync(root,extra,{recursive:true});fs.writeFileSync(path.join(extra,'supabase/migrations/20990101000000_extra.sql'),'select 1;');assert.throws(()=>readCataloguePackage(extra),/Unexpected migration/);
 // Synthetic fixtures retained; no user files deleted or overwritten.
});
test('backup, target, executor and action gates prevent unsupported SQL generation',()=>{
 for(const patch of [{backup:null},{backup:{...backup,verified:false}},{backup:{...backup,projectId:'production'}},{executorRole:'authenticated'},{action:'restore'}])assert.throws(()=>buildCataloguePlan(root,{...options,...patch}));
});
test('review apply plan binds payload ledger atomically and rejects partial/schema/privilege drift',()=>{
 const plan=buildCataloguePlan(root,options);assert.equal(plan.executionReady,false);assert.equal(plan.hostedExecutionSupported,false);
 assert.equal((plan.sql.match(/^begin isolation level/gm)||[]).length,1);assert.ok(plan.sql.endsWith('commit;\n'));
 assert.match(plan.sql,/lock table supabase_migrations.schema_migrations in exclusive mode/);
 assert.match(plan.sql,/pg_advisory_xact_lock\(861021,2202\)/);
 assert.match(plan.sql,/Predecessor ledger\/payload drift/);assert.match(plan.sql,/Catalogue schema without matching ledger/);
 assert.match(plan.sql,/Function\/owner\/security drift/);assert.match(plan.sql,/Existing public policies changed/);
 assert.match(plan.sql,/Recorded catalogue payload drift/);assert.match(plan.sql,/Partial\/unexpected ledger/);
 assert.ok(plan.sql.indexOf('execute ')<plan.sql.lastIndexOf('insert into supabase_migrations'));
});
test('pause is additive, keeps revision security and cannot silently replay an unpause',()=>{
 const {payloads}=readCataloguePackage(root),plan=buildCataloguePlan(root,{...options,action:'pause'});
 assert.match(payloads.pause,/Catalogue writes paused for review/);
 assert.doesNotMatch(payloads.pause,/\b(?:drop\s+(?:table|schema|function)|delete\s+from|truncate\s)/i);
 assert.match(plan.sql,/Unexpected pause state/);assert.match(plan.sql,/revoke all on function public.save_seller_product_v2/);
 assert.match(plan.sql,/return; -- Verified replay/);
});
