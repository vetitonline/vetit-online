import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAutomaticApproval,screenModerationCase} from '../src/lib/moderation/worker.server.js';
import {getModerationStatus,loadModerationStatus} from '../src/lib/moderation/workflow.js';
import {screenContent} from '../src/lib/moderation/policy.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const id='10000000-0000-4000-8000-000000000001',requestId='10000000-0000-4000-8000-000000000002';
test('new migrations leave existing publication authority and durable migration intact',()=>{
 const sql=readFileSync(new URL('../supabase/test-project/migrations/20261019111343_vetit_low_risk_automatic_approval.sql',import.meta.url),'utf8');
 assert.ok(!/create or replace function (?:public\.review_seller_listing|vetit_moderation\.publication_gate|public\.guard_seller_catalog_mutations)/.test(sql));
 assert.ok(!/update public\.(?:listings|businesses)/i.test(sql));
 assert.match(sql,/grant execute on function public\.moderation_auto_approve[^;]+to service_role;/);
 const record=JSON.parse(readFileSync(new URL('../supabase/test-project/release-corrections/durable-moderation-release.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(readFileSync(new URL('../'+record.path,import.meta.url))).digest('hex'),record.sha256);
});
test('storage correction retains restrictive writes and does not expose memberships',()=>{
 const sql=readFileSync(new URL('../supabase/test-project/migrations/20261019120413_vetit_service_storage_boundaries.sql',import.meta.url),'utf8');
 assert.ok(!/drop policy/i.test(sql));assert.ok(!/alter policy "vetit listing image update boundary"/i.test(sql));assert.ok(!/grant\s+(?:select|all)[^;]*business_memberships/i.test(sql));
 assert.match(sql,/security definer set search_path=''/);assert.match(sql,/lm\.compliance_status='approved'/);assert.match(sql,/visibility_status='visible'/);assert.match(sql,/public\.can_write_service_image\(name\)/);
});
test('automatic worker preserves version/key and never accepts publication success',async()=>{
 let call;const client={rpc:async(name,args)=>(call={name,args},{data:{caseId:id,version:4,outcome:'approved',published:false}})};
 assert.equal((await requestAutomaticApproval(client,id,3,requestId)).published,false);assert.equal(call.name,'moderation_auto_approve');assert.equal(call.args.p_request,requestId);assert.equal(call.args.p_version,3);
 await assert.rejects(requestAutomaticApproval({rpc:async()=>({data:{caseId:id,version:4,outcome:'approved',published:true}})},id,3,requestId));
});
test('automatic worker stops on conflict without retry',async()=>{
 let calls=0;await assert.rejects(requestAutomaticApproval({rpc:async()=>{calls++;return{error:{code:'40001'}};}},id,3,requestId),e=>e.status===409);assert.equal(calls,1);
});
function workerFixture(status='passed'){
 let version=1;const calls=[];return{calls,rpc:async(name,args)=>{
  calls.push(name);
  if(name==='moderation_screening_context')return{data:{caseId:id,version,revision:'a'.repeat(64),policyId:requestId,kind:'product',classification:'ordinary',subjectId:id,businessId:id,market:'IN',requiresCredentials:false,images:[{path:'synthetic.jpg',storageVersion:'b'.repeat(64)}]}};
  if(name==='moderation_attest')return{data:{version:++version}};
  return{data:{caseId:id,version:++version,outcome:'approved',published:false}};
 }};
}
const pass={screen:async({revision})=>({status:'passed',revision,validUntil:new Date(Date.now()+60000).toISOString()})};
test('screening invokes opt-in automatic decision only after all checks pass',async()=>{
 const client=workerFixture();const result=await screenModerationCase(client,id,{providers:{content:pass,images:pass,legal:pass},attemptAutomaticApproval:true});assert.equal(result.automaticApproval.outcome,'approved');assert.equal(client.calls.at(-1),'moderation_auto_approve');
});
test('screening defaults off and uncertain/provider-missing evidence never triggers approval',async()=>{
 let client=workerFixture();await screenModerationCase(client,id,{providers:{content:pass,images:pass,legal:pass}});assert.ok(!client.calls.includes('moderation_auto_approve'));
 client=workerFixture();await screenModerationCase(client,id,{providers:{content:pass},attemptAutomaticApproval:true});assert.ok(!client.calls.includes('moderation_auto_approve'));
});
test('provider timeout propagates AbortSignal and returns unavailable',async()=>{
 let aborted=false;const result=await screenContent({revision:'synthetic'},{timeoutMs:5,provider:{screen:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true}))}});
 assert.equal(aborted,true);assert.equal(result.status,'unavailable');
});
test('mobile status transport uses explicit Test origin, headers and checked metadata',async()=>{
 const data={case:{caseId:id,version:2,state:'eligible',reasons:[],correction:'',automaticApproval:{status:'approved',publicationEnabled:false,approvedAt:new Date().toISOString(),validUntil:new Date(Date.now()+60000).toISOString()}},events:[]};
 const result=await getModerationStatus({baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321',accessToken:'synthetic-token',fetchImpl:async(url,options)=>{assert.ok(!url.includes('synthetic-token'));assert.equal(options.headers.authorization,'Bearer synthetic-token');assert.equal(options.cache,'no-store');return new Response(JSON.stringify({apiVersion:1,state:'available',data}));}},'product',id);
 assert.equal(result.case.automaticApproval.status,'approved');
 data.case.automaticApproval.publicationEnabled=true;await assert.rejects(loadModerationStatus({rpc:async()=>({data})},'product',id));
});
test('mobile status transport rejects production, expiry and unsupported response versions',async()=>{
 await assert.rejects(getModerationStatus({baseUrl:'https://vetit.online',testOrigin:'https://vetit.online'},'product',id));
 const base={baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321'};
 await assert.rejects(getModerationStatus({...base,fetchImpl:async()=>new Response('{}',{status:401})},'product',id),e=>e.status===401);
 await assert.rejects(getModerationStatus({...base,fetchImpl:async()=>new Response(JSON.stringify({apiVersion:99,state:'available',data:{case:null,events:[]}}))},'product',id));
});
