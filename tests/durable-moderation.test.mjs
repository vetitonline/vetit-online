import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeModerationCommand,executeModeration,loadModerationStatus,loadModerationQueue,requestModeration,moderationRpcStatus} from '../src/lib/moderation/workflow.js';
import {screenModerationCase} from '../src/lib/moderation/worker.server.js';
const id='10000000-0000-4000-8000-000000000001';
const decision={action:'approve',caseId:id,version:4,requestId:'10000000-0000-4000-8000-000000000002'};
test('case queue validates filters and fails unavailable on malformed data',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return{data:{items:[],hasMore:false}};}};
 await assert.rejects(loadModerationQueue(client,new URLSearchParams('classification=low-risk')));assert.equal(calls,0);
 assert.deepEqual(await loadModerationQueue(client,new URLSearchParams('kind=seller&state=eligible')),{items:[],hasMore:false});
 await assert.rejects(loadModerationQueue({rpc:async()=>({data:{items:[null],hasMore:false}})},new URLSearchParams()));
});
const context={caseId:id,revision:'a'.repeat(64),policyId:decision.requestId,policyVersion:'synthetic',kind:'service',subjectId:id,businessId:id,market:'IN',requiresCredentials:true,text:'Synthetic only',images:[{path:'synthetic-only.jpg',storageVersion:'b'.repeat(64)}]};
function workerClient(value=context){const attestations=[];return{attestations,rpc:async(name,args)=>name==='moderation_screening_context'?{data:value}:(attestations.push(args),{data:{}})};}
test('unconfigured worker records unavailable evidence for every required check',async()=>{
 const client=workerClient();const result=await screenModerationCase(client,id);assert.equal(result.state,'recorded');assert.equal(client.attestations.length,4);assert.ok(client.attestations.every(a=>a.p_status==='unavailable'));
});
test('worker cannot convert missing policy into provider success',async()=>{
 const client=workerClient({...context,policyId:null});const result=await screenModerationCase(client,id);assert.equal(result.state,'unavailable');assert.equal(client.attestations.length,0);
});
test('worker requires provider validity and caps evidence to actual expiry',async()=>{
 const client=workerClient();const until=new Date(Date.now()+60000).toISOString();
 const providers={content:{screen:async()=>({status:'passed',revision:context.revision})},legal:{screen:async()=>({status:'passed',revision:context.revision,validUntil:until})},images:{screen:async()=>{throw Error('private detail');}},credentials:{screen:async()=>({status:'passed',revision:'stale',validUntil:until})}};
 await screenModerationCase(client,id,{providers});
 assert.deepEqual(client.attestations.map(a=>a.p_status),['unavailable','passed','unavailable','unavailable']);
 assert.ok(Date.parse(client.attestations[1].p_expires)<=Date.parse(until));
});
test('worker stops without retry after revision conflict and never approves',async()=>{
 let calls=[];await assert.rejects(screenModerationCase({rpc:async(name)=>{calls.push(name);return name==='moderation_screening_context'?{data:context}:{error:{code:'40001'}};}},id),e=>e.status===409);assert.deepEqual(calls,['moderation_screening_context','moderation_attest']);
});
test('strict commands exclude provider results and privilege claims',()=>{
 for(const extra of [{assessment:{canPublish:true}},{status:'published'},{role:'admin'},{policyId:id}])assert.throws(()=>normalizeModerationCommand({...decision,...extra}));
 assert.deepEqual(normalizeModerationCommand({action:'open',kind:'service',subject:id}),{action:'open',kind:'service',subject:id});
});
test('decision version, action and key are mandatory',()=>{
 for(const change of [{version:0},{version:1.5},{version:'4'},{requestId:''},{action:'automatic_approve'},{caseId:'bad'}])assert.throws(()=>normalizeModerationCommand({...decision,...change}));
});
test('correction/rejection/escalation explanations are bounded',()=>{
 for(const action of ['reject','corrections','escalate'])assert.throws(()=>normalizeModerationCommand({...decision,action}));
 assert.throws(()=>normalizeModerationCommand({...decision,action:'corrections',reasons:['FIX_REQUIRED'],correction:' '}));
 assert.throws(()=>normalizeModerationCommand({...decision,note:'x'.repeat(1001)}));
 assert.throws(()=>normalizeModerationCommand({...decision,reasons:['personal@example.invalid']}));
 assert.equal(normalizeModerationCommand({...decision,action:'corrections',reasons:['FIX_REQUIRED'],correction:'Add details'}).correction,'Add details');
});
test('RPC adapter preserves exact idempotency/version and never sends attestation',async()=>{
 let calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return{data:{caseId:id,version:5,state:'approved'}};}};
 await executeModeration(client,decision);
 assert.equal(calls[0].name,'moderation_decide');assert.equal(calls[0].args.p_version,4);assert.equal(calls[0].args.p_request,decision.requestId);
 await executeModeration(client,{action:'open',kind:'seller',subject:id});assert.equal(calls[1].name,'moderation_open');
});
test('database errors map to redacted permission/conflict/unavailable states',async()=>{
 for(const [code,status]of [['42501',403],['40001',409],['23505',409],['55P03',409],['22023',422],['42883',503]]){
  assert.equal(moderationRpcStatus(code),status);
  await assert.rejects(executeModeration({rpc:async()=>({error:{code,message:'private detail'}})},decision),e=>e.status===status&&!e.message.includes('private detail'));
 }
});
test('status preserves missing-case state and rejects malformed history',async()=>{
 assert.deepEqual(await loadModerationStatus({rpc:async()=>({data:{case:null,events:[]}})},'seller',id),{case:null,events:[]});
 await assert.rejects(loadModerationStatus({rpc:async()=>({data:{case:null,events:[null]}})},'seller',id));
 await assert.rejects(loadModerationStatus({rpc:async()=>({data:{case:{caseId:id,version:1,state:'published',reasons:[],correction:''},events:[]}})},'seller',id));
});
test('native transport requires explicit Test origin and never falls back to production',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('unexpected');};
 for(const baseUrl of ['https://vetit.online','https://www.vetit.online','https://other.invalid'])await assert.rejects(requestModeration({baseUrl,testOrigin:'http://localhost:4321',fetchImpl},decision));
 assert.equal(calls,0);
});
test('native transport passes bearer only in headers and does not retry a conflict',async()=>{
 let calls=0;await assert.rejects(requestModeration({baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321',accessToken:'synthetic-token',fetchImpl:async(url,options)=>{
 calls++;assert.equal(url,'http://localhost:4321/api/moderation');assert.equal(options.headers.authorization,'Bearer synthetic-token');assert.ok(!options.body.includes('synthetic-token'));return new Response('{}',{status:409});}},decision),e=>e.status===409);assert.equal(calls,1);
});
test('successful transport validates response version',async()=>{
 const options={baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321',fetchImpl:async()=>new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{caseId:id,version:5,state:'approved'}}))};
 assert.equal((await requestModeration(options,decision)).state,'approved');
 await assert.rejects(requestModeration({...options,fetchImpl:async()=>new Response(JSON.stringify({apiVersion:2,state:'accepted'}))},decision));
});
test('migration preserves resubmission guard apart from scoped service insertion',()=>{
 const previous=readFileSync(new URL('../supabase/test-project/migrations/20261019095631_vetit_seller_rejected_resubmission.sql',import.meta.url),'utf8');
 const next=readFileSync(new URL('../supabase/test-project/migrations/20261019102037_vetit_durable_moderation.sql',import.meta.url),'utf8');
 const extract=s=>s.match(/create or replace function public\.guard_seller_catalog_mutations\(\)[\s\S]*?revoke all on function public\.guard_seller_catalog_mutations\(\) from public, anon, authenticated;/)[0];
 const expected=extract(previous).replace("seller_action <> 'save' or new.kind <> 'product' or new.moderation_status <> 'draft'","not ((seller_action = 'save' and new.kind = 'product') or (seller_action = 'save_service' and new.kind = 'service')) or new.moderation_status <> 'draft'");
 assert.equal(extract(next),expected);
 assert.ok(!/insert into vetit_moderation\.(policies|reviewers)\b/i.test(next));
});
test('immutable policies/evidence/events, private RLS and service-role-only attestations are explicit',()=>{
 const sql=readFileSync(new URL('../supabase/test-project/migrations/20261019102037_vetit_durable_moderation.sql',import.meta.url),'utf8');
 for(const table of ['policies','cases','evidence','events','reviewers'])assert.ok(sql.includes(`alter table vetit_moderation.${table} enable row level security`));
 for(const table of ['policies','evidence','events'])assert.match(sql,new RegExp(`before update or delete on vetit_moderation\\.${table}`));
 assert.match(sql,/grant execute on function public\.moderation_attest[^;]+to service_role;/);
 assert.ok(!sql.includes("p_action='automatic_approve'"));
});
