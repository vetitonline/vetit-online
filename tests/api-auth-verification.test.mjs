import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {parseBearerAccessToken} from '../src/lib/supabase/auth-token.js';

const source=fs.readFileSync(new URL('../src/lib/supabase/api-auth.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({error=null,user={id:'synthetic-user'},throws=false,configured=true}={}) {
 const calls=[];
 const client={auth:{getUser:async token=>{calls.push(token);if(throws)throw Error('private provider diagnostic');return{data:{user},error};}}};
 const dependencies={
  '@supabase/supabase-js':{createClient:()=>client},
  './auth-token.js':{parseBearerAccessToken},
  './config':{getSupabasePublicConfig:()=>configured?{url:'https://test.example.invalid',publishableKey:'synthetic'}:null},
  './server':{createSupabaseServerClient:()=>client},
 };
 const exports={};new Function('require','exports',compiled)(name=>{assert.ok(name in dependencies);return dependencies[name];},exports);
 return {calls,verify:bearer=>exports.authenticateApiRequest(new Request('http://localhost/api/moderation-session',{
  headers:bearer===undefined?{}:{authorization:bearer},
 }),{})};
}
for(const transport of ['cookie','bearer']) {
 const header=transport==='bearer'?'Bearer aaa.bbb.ccc':undefined;
 test(`${transport}: only verified users authenticate; absent/invalid sessions fail closed`,async()=>{
  const valid=fixture();assert.equal((await valid.verify(header)).state,'authenticated');
  assert.deepEqual(valid.calls,[transport==='bearer'?'aaa.bbb.ccc':undefined]);
  assert.equal((await fixture({user:null}).verify(header)).state,'unauthenticated');
  for(const error of [{status:401},{status:403},{status:400,name:'AuthSessionMissingError'}])
   assert.deepEqual(await fixture({error}).verify(header),{state:'unauthenticated'});
 });
 test(`${transport}: outages and throttling return unavailable even with stale user data`,async()=>{
  for(const error of [{status:503},{status:429},{status:0,name:'AuthRetryableFetchError'},{name:'AuthUnknownError'}])
   assert.deepEqual(await fixture({error}).verify(header),{state:'unavailable'});
  assert.deepEqual(await fixture({throws:true}).verify(header),{state:'unavailable'});
 });
}
test('invalid bearer never falls back to cookies or calls Auth; missing config is unavailable',async()=>{
 const invalid=fixture();assert.deepEqual(await invalid.verify('Bearer invalid'),{state:'unauthenticated'});assert.equal(invalid.calls.length,0);
 const absent=fixture({configured:false});assert.deepEqual(await absent.verify(),{state:'unavailable'});assert.equal(absent.calls.length,0);
});
test('actual session endpoint exposes retryable 503 without diagnostics and retains explicit 401',async()=>{
 const route=fs.readFileSync(new URL('../src/pages/api/moderation-session.ts',import.meta.url),'utf8');
 const output=ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const [error,status,state] of [[{status:503,message:'private diagnostic'},503,'unavailable'],[{status:401},401,'unauthenticated']]) {
  const f=fixture({error}),exports={};
  new Function('require','exports',output)(name=>{assert.equal(name,'../../lib/supabase/api-auth');return{authenticateApiRequest:()=>f.verify('Bearer aaa.bbb.ccc')};},exports);
  const response=await exports.GET({request:new Request('http://localhost/api/moderation-session'),cookies:{}});
  assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await response.json(),{apiVersion:1,state});
 }
});
