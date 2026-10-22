import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtomicPlan,readAtomicPackage,requireBackup} from '../scripts/onboarding-atomic-plan.mjs';
const root='supabase/test-project/releases/vetit-onboarding-20261022-r2';
const now=Date.parse('2026-10-22T10:00:00Z');
const backup={projectId:'apfyfmokcynqiaxqvvxx',verified:true,successfulAt:'2026-10-22T09:00:00Z',inspectedAt:'2026-10-22T09:30:00Z',retentionHours:24,evidenceRef:'SYNTHETIC-LOCAL-TEST-ONLY',restoreProcedureRef:'SYNTHETIC-RESTORE-REVIEW'};
test('missing, wrong-project, stale, future or incomplete backup evidence blocks SQL generation',()=>{
 for(const patch of [null,{verified:false},{projectId:'production'},{successfulAt:'2026-10-20T00:00:00Z'},{inspectedAt:'2026-10-22T11:00:00Z'},{retentionHours:1},{evidenceRef:''},{restoreProcedureRef:''}])assert.throws(()=>requireBackup(patch===null?null:{...backup,...patch},now));
 assert.doesNotThrow(()=>requireBackup(backup,now));
});
test('apply binds exact payload and ledger in a single transaction, with fail-closed replay and partial-release checks',()=>{
 const plan=buildAtomicPlan(root,{backup,executorRole:'vetit_test_admin',now});
 assert.equal(plan.executionReady,false);assert.equal(plan.hostedExecutionSupported,false);
 assert.ok(plan.sql.indexOf('execute ')<plan.sql.indexOf('insert into supabase_migrations'));
 assert.match(plan.sql,/pg_advisory_xact_lock/);assert.match(plan.sql,/Recorded payload drift/);assert.match(plan.sql,/Partial\/unexpected predecessor ledger/);assert.match(plan.sql,/Ledger\/schema drift/);
 // Ledger records include quoted original BEGIN/COMMIT text, not executable wrappers.
 assert.equal((plan.sql.match(/^begin isolation level/gm)||[]).length,1);assert.ok(plan.sql.endsWith('commit;\n'));
 assert.throws(()=>buildAtomicPlan(root,{backup,executorRole:'anon',now}));
});
test('pause retains stronger definitions, triggers and data; cannot restore legacy behavior',()=>{
 const {payloads}=readAtomicPackage(root),plan=buildAtomicPlan(root,{action:'pause',backup,executorRole:'vetit_test_admin',now});
 assert.match(payloads.pause,/revoke all on function public.create_seller_business/);
 assert.doesNotMatch(payloads.pause,/\b(drop|delete|truncate|create or replace)\s/i);
 assert.match(plan.sql,/Unexpected onboarding availability/);assert.match(plan.sql,/insert into supabase_migrations/);
 assert.doesNotThrow(()=>buildAtomicPlan(root,{action:'pause',backup,executorRole:'postgres',now}));
});
