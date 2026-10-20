import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {createModerationRoutes,fixtureDecision} from './moderation-api-fixture.mjs';
import {loadReviewQueue} from '../src/lib/moderation/queue.js';
function sessionRoute(user){const source=fs.readFileSync(new URL('../src/pages/api/moderation-session.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const exports={};new Function('require','exports',compiled)(()=>({authenticateApiRequest:async()=>({state:'authenticated',user})}),exports);return exports.GET;}
test('only dedicated trusted reviewer identity reaches review APIs; editable/global admin claims do not',async()=>{
 for(const user of [{app_metadata:{vetit_admin:true}},{user_metadata:{vetit_reviewer:true}},{app_metadata:{vetit_reviewer:false}}]){
  let calls=0;const client={rpc:async()=>{calls++;}};
  const route=createModerationRoutes(async()=>({state:'authenticated',user,supabase:client}));
  const response=await route.POST({request:new Request('http://localhost:4321/api/moderation',{method:'POST',headers:{origin:'http://localhost:4321','content-type':'application/json'},body:JSON.stringify(fixtureDecision)}),cookies:{}});
  assert.equal(response.status,403);await assert.rejects(loadReviewQueue(client,user,new URLSearchParams()),e=>e.status===403);assert.equal(calls,0);
 }
});
test('dedicated reviewer hint is presentation and database scope denials remain authoritative',async()=>{
 for(const [user,hint] of [[{id:fixtureDecision.caseId,app_metadata:{vetit_reviewer:true}},true],[{id:fixtureDecision.caseId,app_metadata:{vetit_admin:true}},false],[{id:fixtureDecision.caseId,user_metadata:{vetit_reviewer:true}},false]]){
  const response=await sessionRoute(user)({request:new Request('http://localhost:4321/api/moderation-session'),cookies:{}});assert.equal((await response.json()).reviewerHint,hint);
 }
 await assert.rejects(loadReviewQueue({rpc:async()=>({error:{code:'42501'}})},{app_metadata:{vetit_reviewer:true}},new URLSearchParams()),e=>e.status===403);
});
test('reviewer entry is separate from admin taxonomy and English remains the default',()=>{
 const login=fs.readFileSync(new URL('../src/pages/admin/login.astro',import.meta.url),'utf8');assert.match(login,/vetit_reviewer.*Astro.redirect\('\/admin\/cases'/);assert.match(login,/<html lang="en"/);
 const admin=fs.readFileSync(new URL('../src/pages/admin/index.astro',import.meta.url),'utf8');assert.match(admin,/vetit_admin/);assert.ok(!admin.includes('vetit_reviewer'));
});
