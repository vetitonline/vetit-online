import test from 'node:test';
import assert from 'node:assert/strict';
import {screenModerationCase,screenModerationBatch} from '../src/lib/moderation/worker.server.js';
const id='10000000-0000-4000-8000-000000000001';
const pass={screen:async({revision})=>({status:'passed',revision,validUntil:new Date(Date.now()+60000).toISOString()})};
async function run(overrides={},providers={content:pass,legal:pass,images:pass,credentials:pass}){
 const calls=[];let version=1;const context={caseId:id,version,revision:'a'.repeat(64),policyId:id,kind:'product',classification:'ordinary',requiresCredentials:false,images:[{path:'synthetic.jpg',storageVersion:'b'.repeat(64)}],...overrides};
 const result=await screenModerationCase({rpc:async(name,args)=>{calls.push({name,args});return name==='moderation_screening_context'?{data:context}:name==='moderation_attest'?{data:{version:++version}}:{data:{caseId:id,version:++version,outcome:'approved',published:false}};}},id,{providers,attemptAutomaticApproval:true});return{calls,result};
}
test('worker excludes human-review classifications, credentialed businesses, unknown context and seller applications',async()=>{
 for(const overrides of [{classification:'live_animal'},{classification:'veterinary'},{classification:'regulated'},{classification:'prohibited'},{classification:undefined},{requiresCredentials:true},{requiresCredentials:undefined},{kind:'seller'}]){const {calls}=await run(overrides);assert.ok(!calls.some(c=>c.name==='moderation_auto_approve'),JSON.stringify(overrides));}
});
test('empty images fail closed even when an image provider would pass',async()=>{
 let inspected=false;const {calls,result}=await run({images:[]},{content:pass,legal:pass,images:{screen:async()=>{inspected=true;return{};}}});assert.equal(inspected,false);assert.equal(result.checks.find(c=>c.check==='images').status,'unavailable');assert.ok(!calls.some(c=>c.name==='moderation_auto_approve'));
});
test('ordinary product and service still request version-bound approval only after all evidence passes',async()=>{
 for(const kind of ['product','service']){const {calls,result}=await run({kind});assert.equal(calls.at(-1).name,'moderation_auto_approve');assert.equal(calls.at(-1).args.p_version,4);assert.equal(result.automaticApproval.published,false);}
});
test('provider failure or uncertainty never requests automatic approval',async()=>{
 for(const status of ['unavailable','review','blocked']){const {calls}=await run({},{content:{screen:async({revision})=>({status,revision})},legal:pass,images:pass});assert.ok(!calls.some(c=>c.name==='moderation_auto_approve'));}
});
test('bounded screening validates the whole batch before access and continues independent cases without retry or diagnostics',async()=>{
 let calls=0;const other='10000000-0000-4000-8000-000000000002';
 const client={rpc:async(name,args)=>{calls++;if(args.p_case===id)throw Error('synthetic private provider diagnostic');return{data:{caseId:other,revision:'a'.repeat(64),kind:'seller',images:[]}};}};
 for(const values of [[],[id,id],['bad'],Array(11).fill(id)])await assert.rejects(screenModerationBatch(client,values));assert.equal(calls,0);
 const result=await screenModerationBatch(client,[id,other]);assert.deepEqual(result[0],{caseId:id,state:'failed',status:503});assert.equal(result[1].state,'completed');assert.equal(result[1].result.state,'unavailable');assert.equal(calls,2);assert.ok(!JSON.stringify(result).includes('diagnostic'));
});
