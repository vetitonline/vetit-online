import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxNotificationWorker} from '../src/lib/services/notification-delivery.server.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const job=()=>({id:id(1),notificationId:id(2),claimToken:id(3),channel:'email',targetReference:'synthetic:customer_a'});
function fixture(patch={}){const calls=[],sent=[];const options={approved:true,newId:()=>id(3),client:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='claim_sandbox_appointment_notifications'?[job()]:args.p_state};}},provider:{mode:'sandbox',name:'synthetic',idempotent:true,send:async command=>{sent.push(command);return{verified:true,mode:'sandbox',provider:'synthetic',idempotencyKey:command.idempotencyKey,channel:command.channel,targetReference:command.targetReference,status:'accepted',reference:'mock-receipt'};}},...patch};return {options,calls,sent,worker:createSandboxNotificationWorker(options)};}
test('delivery requires explicit approval, sandbox mode and idempotent adapter',()=>{
 for(const patch of [{approved:false},{provider:{mode:'live'}},{timeoutMs:0},{provider:{...fixture().options.provider,idempotent:false}}])assert.throws(()=>fixture(patch));
});
test('one bounded claim produces generic synthetic delivery and verified finish with no payload',async()=>{
 const f=fixture();const result=await f.worker.run(5);assert.equal(result.sent,1);assert.equal(f.sent[0].idempotencyKey,id(1));assert.equal(f.sent[0].template,'appointment_update');assert.equal(f.sent[0].payload,undefined);assert.equal(f.sent[0].notificationId,undefined);assert.equal(f.calls[0].args.p_limit,5);assert.equal(f.calls[1].args.p_claim_token,id(3));assert.equal(f.calls[1].args.p_state,'sent');assert.equal(JSON.stringify(result).includes('customer_a'),false);
});
test('all claim rows are validated before any delivery and real contact targets are rejected',async()=>{
 for(const jobs of [[job(),job()],[{...job(),targetReference:'person@example.invalid'}],[{...job(),claimToken:id(9)}],[{...job(),channel:'sms'}]]){let sends=0;const f=fixture({client:{rpc:async()=>({data:jobs})},provider:{...fixture().options.provider,send:async()=>{sends++;}}});await assert.rejects(f.worker.run(),/unconfirmed/);assert.equal(sends,0);}
});
test('timeout and malformed/mismatched proofs never mark sent or retry',async()=>{
 for(const kind of ['timeout','mismatch','unverified']){let sends=0,finishes=0;const f=fixture({timeoutMs:10,client:{rpc:async(name)=>{if(name==='claim_sandbox_appointment_notifications')return{data:[job()]};finishes++;return{data:'sent'};}},provider:{...fixture().options.provider,send:async command=>{sends++;if(kind==='timeout')return new Promise(()=>{});return{verified:kind!=='unverified',mode:'sandbox',provider:'synthetic',idempotencyKey:kind==='mismatch'?id(9):command.idempotencyKey,channel:command.channel,targetReference:command.targetReference,status:'accepted',reference:'mock'};}}});const result=await f.worker.run();assert.equal(sends,1);assert.equal(finishes,0);assert.equal(result.unconfirmed,1);assert.equal(result.state,'attention_required');}
});
test('definitive sandbox rejection is failed, while unknown finish remains unconfirmed',async()=>{
 const base=fixture();const rejected=fixture({provider:{...base.options.provider,send:async command=>({...await base.options.provider.send(command),status:'rejected'})}});assert.equal((await rejected.worker.run()).failed,1);
 const unknown=fixture({client:{rpc:async(name)=>name==='claim_sandbox_appointment_notifications'?{data:[job()]}:{error:{message:'SECRET'}}}});const result=await unknown.worker.run();assert.equal(result.sent,0);assert.equal(result.unconfirmed,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('overlapping ticks cannot claim or send twice in the same worker',async()=>{
 let finish;const f=fixture({provider:{...fixture().options.provider,send:()=>new Promise(resolve=>finish=resolve)}});const work=f.worker.run();for(let i=0;i<10;i++)await Promise.resolve();assert.equal((await f.worker.run()).state,'skipped');finish({verified:true,mode:'sandbox',provider:'synthetic',idempotencyKey:id(1),channel:'email',targetReference:'synthetic:customer_a',status:'accepted',reference:'mock'});await work;assert.equal(f.calls.filter(call=>call.name==='claim_sandbox_appointment_notifications').length,1);
});
test('unknown claim transport times out without sending and releases the in-process overlap guard',async()=>{
 let sends=0;const f=fixture({timeoutMs:10,client:{rpc:()=>new Promise(()=>{})},provider:{...fixture().options.provider,send:async()=>{sends++;}}});await assert.rejects(f.worker.run(),/unconfirmed/);assert.equal(sends,0);await assert.rejects(f.worker.run(),/unconfirmed/);assert.equal(sends,0);
});
