import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerationWorkspace} from '../src/lib/moderation/session-workspace.js';
import {ModerationError} from '../src/lib/moderation/workflow.js';
const id='10000000-0000-4000-8000-000000000001';
const state=()=>({case:{caseId:id,version:2,state:'pending',reasons:[],correction:''},events:[]});
function fixture(overrides={}){const calls=[];const client={status:async()=>state(),command:async c=>{calls.push(c);return{caseId:id,version:3,state:'escalated'};},...overrides};return{calls,ui:createModerationWorkspace({client,getSession:async()=>({userId:id,accessToken:'synthetic-only'}),kind:'product',subject:id,requestId:()=>id})};}
test('workspace requires refreshed status and reasoned escalation; accepted action locks stale snapshot',async()=>{
 const {ui,calls}=fixture();await assert.rejects(ui.submit('escalate',{reasons:['LEGAL_REVIEW']}),e=>e.status===409);
 await ui.refresh();await assert.rejects(ui.submit('escalate'),e=>e.status===422);assert.equal(calls.length,0);
 await ui.submit('escalate',{reasons:['LEGAL_REVIEW'],note:'Synthetic review'});assert.equal(calls[0].version,2);assert.deepEqual(calls[0].reasons,['LEGAL_REVIEW']);assert.equal(ui.snapshot().refreshRequired,true);
 await assert.rejects(ui.submit('approve'),e=>e.status===409);
});
test('workspace preserves idempotency after uncertain delivery',async()=>{
 const calls=[];const {ui}=fixture({command:async c=>{calls.push(c);if(calls.length===1)throw new ModerationError('Unavailable',503);return{caseId:id,version:3,state:'corrections'};}});
 await ui.refresh();await assert.rejects(ui.submit('corrections',{reasons:['FIX_REQUIRED'],correction:'Correct synthetic details'}));await ui.submit('corrections',{reasons:['FIX_REQUIRED'],correction:'Correct synthetic details'});assert.deepEqual(calls[0],calls[1]);
});
test('workspace rechecks session each operation and removes private snapshot on failed refresh',async()=>{
 let session={userId:id,accessToken:'synthetic-only'},calls=0;const ui=createModerationWorkspace({kind:'service',subject:id,getSession:async()=>session,client:{status:async()=>state(),command:async()=>{calls++;}}});
 await ui.refresh();session=null;await assert.rejects(ui.submit('screen'),e=>e.status===401);assert.equal(calls,0);await assert.rejects(ui.refresh(),e=>e.status===401);assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().refreshRequired,true);
});
test('workspace blocks retry on permission, conflict and expired-session responses',async()=>{
 for(const status of [401,403,409]){const {ui}=fixture({command:async()=>{throw new ModerationError('Denied',status);}});await ui.refresh();await assert.rejects(ui.submit('screen'),e=>e.status===status);assert.equal(ui.snapshot().refreshRequired,true);if(status!==409)assert.equal(ui.snapshot().data,null);}
});
test('workspace prevents concurrent decisions',async()=>{
 let finish,calls=0;const {ui}=fixture({command:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});await ui.refresh();const pending=ui.submit('screen');await Promise.resolve();await Promise.resolve();await assert.rejects(ui.submit('screen'),e=>e.status===409);assert.equal(calls,1);finish({caseId:id,version:3,state:'screened'});await pending;
});
test('seller submission is limited to new or corrected cases and never accepts publication command',async()=>{
 const {ui,calls}=fixture();await ui.refresh();await assert.rejects(ui.submit('open'),e=>e.status===422);await assert.rejects(ui.submit('auto_approve'),e=>e.status===422);assert.equal(calls.length,0);
 for(const current of [null,{...state().case,state:'rejected'},{...state().case,state:'corrections'}]){const f=fixture({status:async()=>({case:current,events:[]})});await f.ui.refresh();await f.ui.submit('open');assert.deepEqual(f.calls[0],{action:'open',kind:'product',subject:id});}
});
test('correction requirements are validated before sending any write',async()=>{
 const {ui,calls}=fixture();await ui.refresh();await assert.rejects(ui.submit('corrections',{reasons:['FIX_REQUIRED'],correction:' '}),e=>e.status===422);assert.equal(calls.length,0);
});

test('account changes invalidate the old snapshot before writes but token refresh for the same identity works',async()=>{
 let session={userId:id,accessToken:'synthetic-first'},writes=0;
 const ui=createModerationWorkspace({kind:'product',subject:id,getSession:async()=>session,requestId:()=>id,client:{status:async()=>state(),command:async()=>{writes++;return{caseId:id,version:3,state:'screened'};}}});
 await ui.refresh();session={userId:'10000000-0000-4000-8000-000000000002',accessToken:'synthetic-second'};await assert.rejects(ui.submit('screen'),e=>e.status===401);assert.equal(writes,0);assert.equal(ui.snapshot().data,null);
 await ui.refresh();session={...session,accessToken:'synthetic-refreshed'};await ui.submit('screen');assert.equal(writes,1);
});
test('identity changes during a status request cannot reveal its response',async()=>{
 let session={userId:id,accessToken:'synthetic-only'};
 const ui=createModerationWorkspace({kind:'product',subject:id,getSession:async()=>session,client:{status:async()=>{session=null;return state();},command:async()=>{throw Error('must not write');}}});
 await assert.rejects(ui.refresh(),e=>e.status===401);assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().refreshRequired,true);
});
test('unverified identity is rejected before status access',async()=>{
 for(const userId of [undefined,'invalid']){let reads=0;const ui=createModerationWorkspace({kind:'service',subject:id,getSession:async()=>({userId,accessToken:'synthetic-only'}),client:{status:async()=>{reads++;return state();},command:async()=>{}}});await assert.rejects(ui.refresh(),e=>e.status===401);assert.equal(reads,0);}
});
test('coalesced refreshes still reject an account change and never retain the previous private result',async()=>{
 let session={userId:id,accessToken:'synthetic-only'},finish,started,reads=0;const ready=new Promise(resolve=>{started=resolve;});
 const ui=createModerationWorkspace({kind:'product',subject:id,getSession:async()=>session,client:{status:()=>{reads++;started();return new Promise(resolve=>{finish=resolve;});},command:async()=>{throw Error('No write allowed');}}});
 const first=ui.refresh(),second=ui.refresh();await ready;assert.equal(reads,1);session={userId:'10000000-0000-4000-8000-000000000002',accessToken:'synthetic-other'};finish(state());
 const results=await Promise.allSettled([first,second]);assert.ok(results.every(result=>result.status==='rejected'&&result.reason.status===401));assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().refreshRequired,true);
});
