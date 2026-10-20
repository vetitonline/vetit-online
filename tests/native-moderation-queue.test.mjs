import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import ts from 'typescript';
import {createNativeModerationSession} from '../mobile/src/moderation-session.js';
import {createMobileModerationClient} from '../mobile/src/moderation-client.ts';
import {getModerationQueue,moderationNeedsReview} from '../src/lib/moderation/workflow.js';
import {createModerationRoutes,fixtureId} from './moderation-api-fixture.mjs';
const row={id:fixtureId,subject_id:fixtureId,subject_kind:'product',state:'escalated',version:2,title:'Synthetic flagged listing',seller_name:'Synthetic seller',market:'IN',category_id:fixtureId,classification:'ordinary',reasons:['SUSPICIOUS_CONTENT'],created_at:'2026-10-19T12:00:00Z',updated_at:'2026-10-19T12:00:00Z'};
function sessionRoute(authenticate){const source=fs.readFileSync(new URL('../src/pages/api/moderation-session.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exports={};new Function('require','exports',compiled)(name=>{assert.equal(name,'../../lib/supabase/api-auth');return{authenticateApiRequest:authenticate};},exports);return exports;}
test('session route returns minimum verified identity, ignores editable metadata, and never exposes tokens',async()=>{
 const routes=sessionRoute(async()=>({state:'authenticated',user:{id:fixtureId,email:'private@example.invalid',user_metadata:{vetit_admin:true},app_metadata:{vetit_admin:false}}}));const response=await routes.GET({request:new Request('http://localhost'),cookies:{}});assert.match(response.headers.get('cache-control'),/private, no-store/);assert.deepEqual(await response.json(),{apiVersion:1,state:'available',userId:fixtureId,reviewerHint:false});
 for(const [state,status] of [['unauthenticated',401],['unavailable',503]])assert.equal((await sessionRoute(async()=>({state})).GET({request:new Request('http://localhost'),cookies:{}})).status,status);
});
test('session verification hides unexpected authentication diagnostics',async()=>{
 const route=sessionRoute(async()=>{throw Error('private auth diagnostic');});const response=await route.GET({request:new Request('http://localhost'),cookies:{}});assert.equal(response.status,503);assert.ok(!(await response.text()).includes('diagnostic'));
});
test('queue transport validates cursor pairs and response data; forwards bearer only to explicit Test origin',async()=>{
 let requests=0;const options={baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321',accessToken:'synthetic-token',fetchImpl:async(url,opts)=>{requests++;const u=new URL(url);assert.equal(u.searchParams.get('view'),'queue');assert.equal(u.searchParams.get('before'),row.created_at);assert.equal(opts.headers.authorization,'Bearer synthetic-token');return new Response(JSON.stringify({apiVersion:1,state:'available',data:{items:[row],hasMore:true}}));}};
 await assert.rejects(getModerationQueue(options,new URLSearchParams({before:row.created_at})));assert.equal(requests,0);const result=await getModerationQueue(options,new URLSearchParams({before:row.created_at,id:fixtureId}));assert.equal(result.items[0].id,fixtureId);
 await assert.rejects(getModerationQueue({...options,fetchImpl:async()=>new Response(JSON.stringify({apiVersion:1,state:'available',data:{items:[{...row,id:'invalid'}],hasMore:false}}))}));
});
test('triage keeps successful automatic decisions out of manual review while uncertain and regulated-policy states remain reviewable',()=>{
 assert.equal(moderationNeedsReview({state:'pending',reasons:[]}),false);assert.equal(moderationNeedsReview({state:'eligible',reasons:[],automaticApproval:{status:'approved',publicationEnabled:false}}),false);
 for(const value of [{state:'pending',reasons:['CONTENT_NOT_PASSED']},{state:'screened',reasons:[]},{state:'escalated',reasons:[]},{state:'eligible',automaticApproval:{status:'review_required',publicationEnabled:false}}])assert.equal(moderationNeedsReview(value),true);
});
test('malformed queue classifications, revisions, timestamps and empty continuation pages fail closed',async()=>{
 const base={baseUrl:'http://localhost:4321',testOrigin:'http://localhost:4321',accessToken:'synthetic-token'};
 for(const value of [{items:[{...row,classification:'untrusted'}],hasMore:false},{items:[{...row,version:0}],hasMore:false},{items:[{...row,updated_at:'invalid'}],hasMore:false},{items:[],hasMore:true}])await assert.rejects(getModerationQueue({...base,fetchImpl:async()=>new Response(JSON.stringify({apiVersion:1,state:'available',data:value}))}),e=>e.status===503);
});
test('bounded loopback native verification and queue use actual API routes; database reviewer revocation still denies', {timeout:15000},async()=>{
 let reviewer=true,requests=0;const authenticate=async request=>{requests++;assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');return{state:'authenticated',user:{id:fixtureId,app_metadata:{vetit_admin:true}},supabase:{rpc:async()=>reviewer?{data:{items:[row],hasMore:false}}:{error:{code:'42501'}}}};};
 const identity=sessionRoute(authenticate),queue=createModerationRoutes(authenticate);const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1'),request=new Request(url,{headers:req.headers});const result=await(url.pathname==='/api/moderation-session'?identity.GET({request,cookies:{}}):queue.GET({request,url,cookies:{}}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch{res.writeHead(500);res.end();}});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const deadline=setTimeout(()=>{server.closeAllConnections();server.close();},12000);
 try{const origin=`http://127.0.0.1:${server.address().port}`;const host=createNativeModerationSession({apiBaseUrl:origin,testApiOrigin:origin,getAccessToken:async()=> 'synthetic-token'}),client=createMobileModerationClient({apiBaseUrl:origin,testApiOrigin:origin});const session=await host.getSession();assert.equal((await client.queue(new URLSearchParams(),session)).items[0].state,'escalated');reviewer=false;await assert.rejects(client.queue(new URLSearchParams(),session),e=>e.status===403);assert.equal(requests,3);host.clear();}
 finally{clearTimeout(deadline);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
