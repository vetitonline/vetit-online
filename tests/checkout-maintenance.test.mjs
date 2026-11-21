import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutMaintenanceJob} from '../src/lib/commerce/checkout-maintenance.server.js';
const id='10000000-0000-4000-8000-000000000001';
const row=(outcome='expired',reconciliation='no_attempt')=>({orderId:id,outcome,reconciliation});
const batch=(results=[])=>({scanned:results.length,results});
const config=expireDue=>({approved:true,worker:{payments:{mode:'sandbox'},expireDue},intervalMs:1000,batchLimit:5});
test('job construction is disabled without explicit sandbox approval and bounded policy',()=>{
  for(const overrides of [{approved:false},{worker:{payments:{mode:'live'},expireDue(){}}},{batchLimit:0},{batchLimit:101},{intervalMs:0},{intervalMs:Infinity}]) assert.throws(()=>createCheckoutMaintenanceJob({...config(()=>{}),...overrides}),/Explicit sandbox/);
});
test('scheduler tick uses one bounded batch and returns aggregate results only',async()=>{
  let calls=0;const job=createCheckoutMaintenanceJob(config(async limit=>{calls++;assert.equal(limit,5);return batch([row()]);}));
  const result=await job.run();assert.equal(result.state,'completed');assert.equal(result.counts.expired,1);assert.equal(calls,1);assert.equal(JSON.stringify(result).includes(id),false);
});
test('overlapping ticks and ticks inside the interval cannot repeat worker calls',async()=>{
  let finish,calls=0,time=1000;const job=createCheckoutMaintenanceJob({...config(()=>{calls++;return new Promise(resolve=>finish=resolve);}),now:()=>time});
  const pending=job.run();assert.deepEqual(await job.run(),{state:'skipped',reason:'running'});finish(batch());await pending;
  assert.equal((await job.run()).reason,'not_due');assert.equal(calls,1);time=2000;const next=job.run();finish(batch());await next;assert.equal(calls,2);
});
test('unknown worker failures are sanitized, never retried within the tick, and rate bounded',async()=>{
  let calls=0,time=1000;const job=createCheckoutMaintenanceJob({...config(async()=>{calls++;throw Error('secret provider evidence');}),now:()=>time});
  await assert.rejects(job.run(),error=>error.status===503&&!error.message.includes('secret'));assert.equal(calls,1);assert.equal((await job.run()).reason,'not_due');time=2000;await assert.rejects(job.run());assert.equal(calls,2);
});
test('malformed, duplicate or incomplete batches cannot be reported as successful',async()=>{
  for(const value of [{scanned:1,results:[]},batch([row(),row()]),batch([{...row(),outcome:'paid'}]),batch([{...row(),reconciliation:'unverified'}]),batch([{...row(),orderId:'bad'}]),{scanned:6,results:[]}]) {
    await assert.rejects(createCheckoutMaintenanceJob(config(async()=>value)).run(),/unconfirmed/);
  }
});
test('blocked payments are reported separately from unavailable attempts and expiry',async()=>{
  const result=await createCheckoutMaintenanceJob(config(async()=>batch([row('blocked_payment','review_required'),{...row('unavailable','unavailable'),orderId:'10000000-0000-4000-8000-000000000002'}]))).run();
  assert.equal(result.state,'partial');assert.equal(result.counts.expired,0);assert.equal(result.counts.blocked_payment,1);assert.equal(result.counts.unavailable,1);
});
test('invalid clocks do not call worker; backwards clock allows recovery',async()=>{
  let time=1000,calls=0;const job=createCheckoutMaintenanceJob({...config(async()=>{calls++;return batch();}),now:()=>time});await job.run();time=NaN;await assert.rejects(job.run(),/clock/);assert.equal(calls,1);time=500;await job.run();assert.equal(calls,2);
});
test('scheduled job drives the real lifecycle worker and retains unresolved payment protection',async()=>{
  const {createCheckoutLifecycleWorker}=await import('../src/lib/commerce/checkout-lifecycle.server.js');
  const calls=[];
  const worker=createCheckoutLifecycleWorker({approved:true,reservationTtlSeconds:60,provider:{mode:'sandbox',name:'synthetic',create:async()=>{throw Error('Must not create payments');},getVerifiedStatus:async()=>{throw Error('Missing reference must not reach provider');}},client:{rpc:async(name)=>{
    calls.push(name);
    if(name==='list_due_checkout_reservations')return {data:[id]};
    if(name==='get_checkout_lifecycle')return {data:{orderId:id,customerId:id,orderStatus:'pending',amountMinor:100,currencyCode:'INR',expiresAt:'2020-01-01T00:00:00Z',attempt:{id,paymentId:id,provider:'synthetic',reference:null,status:'starting',needsReview:false}}};
    if(name==='expire_checkout_reservation')return {data:{orderId:id,outcome:'blocked_payment'}};
    throw Error('Unexpected mutation');
  }}});
  const result=await createCheckoutMaintenanceJob({approved:true,worker}).run();
  assert.equal(result.counts.blocked_payment,1);assert.equal(result.counts.expired,0);
  assert.deepEqual(calls,['list_due_checkout_reservations','get_checkout_lifecycle','expire_checkout_reservation']);
});
