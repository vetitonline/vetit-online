import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runAppointmentExpiryWorker} from '../src/lib/services/appointment-expiry-worker.mjs';
test('worker has no default network activity or automatic scheduling',async()=>{
  assert.deepEqual(await runAppointmentExpiryWorker({invoke:()=>{throw Error('unexpected');}}),{state:'disabled',runs:[]});
});
test('uncertain transport retries retain run identity; durable retryable receipts use a new identity',async()=>{
  let calls=0,id=0;const identities=[];const delays=[];
  const result=await runAppointmentExpiryWorker({enabled:true,newId:()=>String(++id),wait:async ms=>delays.push(ms),invoke:async args=>{
    identities.push(args.p_run_id);calls++;if(calls===1)throw Object.assign(Error('offline'),{code:'TRANSPORT'});
    return calls===2?{state:'completed',processed:0,retryable:1,failed:0,hasMore:true}:{state:'completed',processed:0,retryable:0,failed:0,hasMore:false};
  }});
  assert.deepEqual(identities,['1','1','2']);assert.equal(result.state,'drained');assert.equal(delays.length,2);
});
test('worker bounds batches/retries and does not retry permanent errors',async()=>{
  let calls=0;
  const result=await runAppointmentExpiryWorker({enabled:true,maxRuns:2,wait:async()=>{},invoke:async()=>{calls++;return{state:'completed',processed:1,retryable:0,failed:0,hasMore:true};}});
  assert.equal(result.state,'bounded');assert.equal(calls,2);
  await assert.rejects(()=>runAppointmentExpiryWorker({enabled:true,invoke:async()=>{throw Object.assign(Error('denied'),{code:'42501'});}}),/denied/);
  const attention=await runAppointmentExpiryWorker({enabled:true,invoke:async()=>({state:'completed',processed:0,retryable:0,failed:1,hasMore:true})});assert.equal(attention.state,'attention_required');
});
test('skipped busy providers are not falsely reported as drained',async()=>{
  let calls=0;
  const result=await runAppointmentExpiryWorker({enabled:true,wait:async()=>{},invoke:async()=>({state:'completed',processed:0,retryable:0,failed:0,hasMore:++calls===1})});
  assert.equal(calls,2);assert.equal(result.state,'drained');
});
test('operations proposal contains approval/ownership gates and never releases historical capacity',async()=>{
  const sql=await readFile(new URL('../supabase/test-project/appointment-operations.proposal.sql',import.meta.url),'utf8');
  assert.match(sql,/enabled boolean not null default false/);assert.match(sql,/approved boolean not null default false/);
  assert.match(sql,/for update of b skip locked/);assert.match(sql,/on conflict\(run_id\) do nothing/);
  assert.match(sql,/assert_manager\(provider\)/);assert.match(sql,/b.customer_profile_id is distinct from p_customer_id/);
  assert.doesNotMatch(sql,/set status='available'|set status='cancelled'|cron\.schedule|update public\.payments|delete from/i);
});
