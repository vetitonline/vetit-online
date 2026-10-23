import test from 'node:test';
import assert from 'node:assert/strict';
import {readFourteenPackage,reconcilePrefix,buildFourteenStep} from '../scripts/fourteen-step-executor.mjs';
export const root=new URL('../supabase/test-project/releases/vetit-test-20261021-r1/',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const now=Date.parse('2026-10-22T20:00:00Z');
export const options={step:1,executorRole:'vetit_test_admin',now,
 backup:{projectId:'apfyfmokcynqiaxqvvxx',verified:true,successfulAt:'2026-10-22T19:00:00Z',inspectedAt:'2026-10-22T19:59:00Z',retentionHours:24,evidenceRef:'SYNTHETIC LOCAL ONLY',restoreProcedureRef:'SYNTHETIC LOCAL ONLY'},
 preflight:{projectId:'apfyfmokcynqiaxqvvxx',reviewed:true,observedAt:'2026-10-22T19:59:00Z',prefix:0,schemaHash:'a'.repeat(32),evidenceRef:'SYNTHETIC LOCAL ONLY'}};
test('all fourteen immutable payloads, exact prefixes and final completion',()=>{
 const p=readFourteenPackage(root),rows=p.manifest.foundationPreserve.map(x=>({...x}));
 assert.equal(p.steps.length,14);
 for(let i=0;i<=14;i++){
  assert.deepEqual(reconcilePrefix(p,rows),{prefix:i,next:i===14?null:p.steps[i].version});
  if(i<14)rows.push({...p.steps[i],statements:[p.steps[i].raw]});
 }
});
test('gaps, aliases, altered payloads, unknown later packages fail closed',()=>{
 const p=readFourteenPackage(root),rows=[...p.manifest.foundationPreserve,...p.steps.map(x=>({...x,statements:[x.raw]}))];
 for(const bad of [rows.filter((_,i)=>i!==7),rows.map((x,i)=>i===0?{...x,name:'wrong'}:x),rows.map((x,i)=>i===4?{...x,statements:['changed']}:x),[...rows,{version:'20261023000000',name:'later'}]])assert.throws(()=>reconcilePrefix(p,bad));
});
test('one atomic wrapper, exact original ledger bytes, no automatic replay or hosted adapter',()=>{
 const p=readFourteenPackage(root);
 for(let step=1;step<=14;step++){
  const plan=buildFourteenStep(root,{...options,step});
  assert.equal(plan.hostedExecutionSupported,false);
  assert.equal((plan.sql.match(/^begin isolation level/gm)||[]).length,1);
  // Original payloads also contain COMMIT as quoted ledger data, never executed wrappers.
  assert.ok(plan.sql.endsWith('commit;\n'));
  assert.doesNotMatch(p.steps[step-1].ddl,/^\s*(begin|commit);\s*$/im);
  assert.ok(plan.sql.includes(p.steps[step-1].raw.replaceAll("'","''")));
  assert.match(plan.sql,/if prefix>=\d+ then return;end if; -- Verified replay/);
  assert.match(plan.sql,/pg_advisory_xact_lock\(861021,2202\)/);
  assert.match(plan.sql,/lock table supabase_migrations.schema_migrations in exclusive mode/);
 }
});
test('missing, stale, future and malformed gates and unsafe roles rejected',()=>{
 for(const change of [{backup:null},{executorRole:'service_role'},{step:15},{preflight:null},...[
  {reviewed:false},{prefix:-1},{schemaHash:'bad'},{observedAt:'2026-10-22T18:00:00Z'},{observedAt:'2026-10-23T20:00:00Z'},{evidenceRef:'\n'}
 ].map(x=>({preflight:{...options.preflight,...x}}))])assert.throws(()=>buildFourteenStep(root,{...options,...change}));
});
