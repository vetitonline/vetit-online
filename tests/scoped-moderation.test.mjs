import test from 'node:test';import assert from 'node:assert/strict';
import {createScopedProvider,screenBusinessCase} from '../src/lib/moderation/scoped-provider.server.js';
import {screenModerationCase} from '../src/lib/moderation/worker.server.js';
import {scopedProposal} from '../scripts/prepare-scoped-moderation.mjs';import fs from 'node:fs';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',revision='a'.repeat(64);
test('scoped adapter denies other business, market and expired grants before provider access',async()=>{
 let calls=0,now=1000;const scope=createScopedProvider({businessId:id,check:'content',expiresAt:new Date(3000).toISOString(),now:()=>now,provider:{screen:async()=>{calls++;return{};}}});
 for(const input of [{businessId:other,market:'IN',check:'content'},{businessId:id,market:'US',check:'content'},{businessId:id,market:'IN',check:'legal'}])await assert.rejects(scope.screen({...input,kind:'product',revision}));now=4000;await assert.rejects(scope.screen({businessId:id,market:'IN',kind:'product',check:'content',revision}));assert.equal(calls,0);
});
test('provider payload excludes identity/DB credentials and caps normalized evidence to grant expiry',async()=>{
 let payload;const scope=createScopedProvider({businessId:id,check:'content',expiresAt:new Date(3000).toISOString(),now:()=>1000,provider:{screen:async value=>{payload=value;return{status:'passed',revision,validUntil:new Date(5000).toISOString(),diagnostic:'private'};}}});
 const result=await scope.screen({check:'content',businessId:id,subjectId:id,market:'IN',kind:'product',revision,text:'Synthetic',databaseClient:'private',credentials:'private'});
 assert.equal(payload.text,'Synthetic');assert.equal('businessId' in payload,false);assert.equal(JSON.stringify(payload).includes('private'),false);assert.equal(result.validUntil,new Date(3000).toISOString());assert.equal(JSON.stringify(result).includes('private'),false);
});
test('actual worker cannot turn a scoped provider mismatch into approval',async()=>{
 const calls=[];const provider=createScopedProvider({businessId:other,check:'content',expiresAt:new Date(Date.now()+60000).toISOString(),provider:{screen:async()=>{throw Error('must not run');}}});
 await screenModerationCase({rpc:async(name,args)=>{calls.push({name,args});return name==='moderation_screening_context'?{data:{caseId:id,businessId:id,market:'IN',kind:'product',revision,policyId:id,images:[]}}:{data:{}};}},id,{providers:{content:provider}});
 assert.equal(calls.find(c=>c.name==='moderation_attest').args.p_status,'unavailable');assert.ok(!calls.some(c=>c.name==='moderation_auto_approve'));
});
test('SQL proposal regenerates exactly and removes all global authorization callers',()=>{
 const sql=scopedProposal();assert.equal(sql,fs.readFileSync(new URL('../supabase/test-project/release-corrections/business-scoped-moderation.proposal.sql',import.meta.url),'utf8'));
 assert.equal((sql.match(/vetit_moderation\.is_admin\(\)/g)??[]).length,1);assert.match(sql,/where vetit_moderation.has_scope\(c.business_id,'read'\)/);assert.match(sql,/require_scope\(c.business_id,case when p_action='approve' then 'publish'/);assert.match(sql,/has_scope\(b,'read'\)/);assert.match(sql,/scope_events_immutable/);
});

test('business coordinator denies foreign context before adapters and never exposes automatic decision RPC',async()=>{
 let providers=0,attestations=0;
 const options={businessId:id,expiresAt:new Date(Date.now()+60000).toISOString(),providers:{content:{screen:async input=>{providers++;return{status:'passed',revision:input.revision,validUntil:new Date(Date.now()+60000).toISOString()};}}}};
 const context={caseId:id,businessId:other,market:'IN',kind:'seller',revision,policyId:id};
 const client={rpc:async(name)=>{if(name==='moderation_screening_context')return{data:{...context,images:[]}};assert.equal(name,'moderation_attest');attestations++;return{data:{}};}};
 await assert.rejects(screenBusinessCase(client,id,options));assert.equal(providers,0);assert.equal(attestations,0);
 context.businessId=id;await screenBusinessCase(client,id,options);assert.equal(providers,1);assert.equal(attestations,2);
});

test('scope expiring during provider work prevents any later attestation',async()=>{
 let clock=Date.now(),writes=0;const until=clock+1000;
 await assert.rejects(screenBusinessCase({rpc:async(name)=>{
  if(name==='moderation_screening_context')return{data:{caseId:id,businessId:id,market:'IN',kind:'seller',revision,policyId:id,images:[]}};
  writes++;return{data:{}};
 }},id,{businessId:id,expiresAt:new Date(until).toISOString(),now:()=>clock,providers:{content:{screen:async()=>{clock=until;return{status:'passed',revision,validUntil:new Date(until+10000).toISOString()};}}}}),/permission expired/);
 assert.equal(writes,0);
});

test('expired context and malformed case IDs stop before adapter or database work respectively',async()=>{
 let clock=Date.now(),reads=0,providers=0;const until=clock+1000;
 const options={businessId:id,expiresAt:new Date(until).toISOString(),now:()=>clock,providers:{content:{screen:async()=>{providers++;return{};}}}};
 const client={rpc:async()=>{reads++;clock=until;return{data:{caseId:id,businessId:id,market:'IN'}};}};
 await assert.rejects(screenBusinessCase(client,'invalid',options),/Valid scoped/);assert.equal(reads,0);
 await assert.rejects(screenBusinessCase(client,id,options),/permission expired/);assert.equal(reads,1);assert.equal(providers,0);
});
