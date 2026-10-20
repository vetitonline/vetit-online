import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerationRoutes,fixtureId,fixtureDecision} from './moderation-api-fixture.mjs';
const origin='http://localhost:4321';
function post(value,headers={}){return {request:new Request(origin+'/api/moderation',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value)}),cookies:{}};}
const auth=(rpc=async()=>({data:{caseId:fixtureId,state:'approved',version:2}}),admin=true)=>async()=>({state:'authenticated',user:{app_metadata:{vetit_reviewer:admin}},supabase:{rpc}});
test('actual API route denies cross-origin requests before authentication',async()=>{
 let calls=0;const routes=createModerationRoutes(async()=>{calls++;throw Error('must not run');});
 assert.equal((await routes.POST(post(fixtureDecision,{origin:'https://untrusted.invalid'}))).status,403);assert.equal(calls,0);
});
test('actual API route handles expired/unavailable authentication without RPC writes',async()=>{
 for(const [state,status]of [['unauthenticated',401],['unavailable',503]])assert.equal((await createModerationRoutes(async()=>({state})).POST(post(fixtureDecision))).status,status);
});
test('actual API route requires current admin metadata for decisions',async()=>assert.equal((await createModerationRoutes(auth(undefined,false)).POST(post(fixtureDecision))).status,403));
test('actual API route rejects provider-result injection and oversized input',async()=>{
 let calls=0;const routes=createModerationRoutes(auth(async()=>{calls++;}));
 assert.equal((await routes.POST(post({...fixtureDecision,providerPassed:true}))).status,422);
 assert.equal((await routes.POST(post({...fixtureDecision,note:'x'.repeat(9000)}))).status,413);assert.equal(calls,0);
});
test('actual API route never exposes automatic approval to authenticated clients',async()=>assert.equal((await createModerationRoutes(auth()).POST(post({...fixtureDecision,action:'auto_approve'}))).status,422));
test('actual API route maps database conflicts and uses private no-store responses',async()=>{
 const response=await createModerationRoutes(auth(async()=>({error:{code:'40001',message:'private database detail'}}))).POST(post(fixtureDecision));
 assert.equal(response.status,409);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.ok(!(await response.text()).includes('private database detail'));
});
test('actual API read supports seller status and denies non-admin case queue',async()=>{
 const routes=createModerationRoutes(auth(async(name)=>({data:name==='moderation_status'?{case:null,events:[]}:{items:[],hasMore:false}}),false));
 let url=new URL(origin+`/api/moderation?kind=product&subject=${fixtureId}`);
 assert.equal((await routes.GET({request:new Request(url),url,cookies:{}})).status,200);
 url=new URL(origin+'/api/moderation?view=queue');assert.equal((await routes.GET({request:new Request(url),url,cookies:{}})).status,403);
});
