// Actual route with injected verified identities/query results; no hosted calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as validation from '../src/lib/seller/validation.js';
import * as permissions from '../src/lib/seller/permissions.js';
import * as security from '../src/lib/api/request-security.js';

const userId='10000000-0000-4000-8000-000000000001',businessId='20000000-0000-4000-8000-000000000001';
const source=fs.readFileSync(new URL('../src/pages/api/seller/business.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(options={}) {
 const writes=[],reads=[];let authCalls=0;
 const client={from:table=>{
  let updating=false;
  const query={select:()=>query,eq:(...args)=>{reads.push([table,...args]);return query;},
   update:value=>{updating=true;writes.push({table,value});return query;},
   maybeSingle:async()=>table==='business_memberships'
    ?{data:{profile_id:userId,business_id:businessId,member_role:'owner',membership_status:'active',...options.membership},error:options.membershipError}
    :{data:options.missingBusiness?null:{business_type:'farm',is_active:true,archived_at:null,...options.business},error:options.businessError},
   single:async()=>{assert.equal(updating,true);return{data:options.zeroRows?null:{id:options.updatedId??businessId},error:options.updateError};},
  };return query;
 },rpc:async(name,args)=>{writes.push({name,args});if(options.rpcThrows)throw Error('private diagnostic');return{data:options.createdId===undefined?businessId:options.createdId,error:options.rpcError};}};
 const modules={
  '../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>{authCalls++;return{state:options.authState??'authenticated',user:{id:userId,user_metadata:{role:'admin'}},supabase:client};}},
  '../../../lib/supabase/config':{getSupabasePublicConfig:()=>options.configured!==false},
  '../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':security,
 };
 const exports={};new Function('require','exports',output)(name=>{assert.ok(name in modules,`Unexpected dependency ${name}`);return modules[name];},exports);
 const form=extra=>new URLSearchParams({display_name:'  पशु Farm  ',business_type:'farm',...extra}).toString();
 return{writes,reads,authCalls:()=>authCalls,post:(extra={},headers={},raw)=>exports.POST({request:new Request('http://localhost:4321/api/seller/business',{
  method:'POST',headers:{origin:'http://localhost:4321','content-type':'application/x-www-form-urlencoded',...headers},body:raw??form(extra),
 }),cookies:{}})};
}
const location=response=>new URL(response.headers.get('location')).pathname+new URL(response.headers.get('location')).search;

test('business mutation rejects cross-site, absent origin, unsupported content and missing config before Auth',async()=>{
 for(const [options,headers,status] of [[{},{origin:'https://foreign.invalid'},403],[{},{origin:''},403],[{},{'sec-fetch-site':'cross-site'},403],[{},{'content-type':'text/plain'},415],[{configured:false},{},503]]){
  const f=fixture(options);assert.equal((await f.post({},headers)).status,status);assert.equal(f.authCalls(),0);assert.equal(f.writes.length,0);
 }
});
test('Auth outages stay retryable; unauthenticated sessions redirect without seller writes',async()=>{
 for(const authState of ['unavailable','unauthenticated']){
  const f=fixture({authState}),response=await f.post();assert.equal(response.status,authState==='unavailable'?503:303);assert.equal(f.writes.length,0);
  if(authState==='unavailable'){assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');}
  else assert.match(location(response),/^\/login\?/);
 }
});
test('new seller creation calls only the existing atomic RPC with validated allowlisted fields',async()=>{
 const f=fixture(),response=await f.post({role:'admin',profile_id:businessId,is_active:'true',verification_status:'verified',country_code:'US'});
 assert.equal(location(response),'/seller?saved=business');assert.deepEqual(f.writes,[{name:'create_seller_business',args:{p_display_name:'पशु Farm',p_legal_name:null,p_business_type:'farm',p_public_email:null,p_public_phone:null,p_website_url:null}}]);
 assert.equal(f.reads.length,0); // Profile provisioning/retry mutex stays inside the existing RPC.
});
test('creation never claims success for absent/malformed RPC receipts or provider errors',async()=>{
 for(const options of [{createdId:null},{createdId:'invalid'},{rpcError:{message:'private diagnostic'}},{rpcThrows:true}]){
  const f=fixture(options),response=await f.post();assert.equal(location(response),'/seller/onboarding?error=save');assert.equal(f.writes.length,1);assert.ok(!(await response.text()).includes('private'));
 }
});
test('business identifiers, duplicate fields, file scalars and unsafe input cannot reach writes',async()=>{
 for(const raw of [`display_name=Farm&business_id=invalid`,`display_name=Farm&business_id=${businessId}&business_id=${businessId}`,'display_name=Farm&display_name=Other','display_name=Farm&website_url=javascript%3Aalert(1)','display_name=Farm&business_type=clinic']){
  const f=fixture();await f.post({}, {},raw);assert.equal(f.writes.length,0);
 }
 const f=fixture(),body=new FormData();body.set('display_name',new Blob(['invalid']), 'file.txt');
 // Multipart requests retain the same scalar validation as URL-encoded forms.
 const request=new Request('http://localhost:4321/api/seller/business',{method:'POST',headers:{origin:'http://localhost:4321'},body});
 const response=await f.post({}, {'content-type':request.headers.get('content-type')},await request.text());
 assert.equal(location(response),'/seller/onboarding?error=save');assert.equal(f.writes.length,0);
});
test('only current owner/admin membership in an active business may edit',async()=>{
 for(const options of [{membership:{profile_id:businessId}},{membership:{business_id:userId}},{membership:{member_role:'catalog_manager'}},{membership:{member_role:'viewer'}},{membership:{membership_status:'inactive'}},{membershipError:{}},{business:{is_active:false}},{business:{archived_at:'2026-01-01'}},{missingBusiness:true},{businessError:{}}]){
  const f=fixture(options),response=await f.post({business_id:businessId});assert.ok([403,404].includes(response.status));assert.equal(f.writes.length,0);
 }
});
test('confirmed owner/admin edits update only public business fields; type and verification remain protected',async()=>{
 for(const member_role of ['owner','admin']){
  const f=fixture({membership:{member_role}}),response=await f.post({business_id:businessId,business_type:'company',role:'admin',verification_status:'verified'});
  assert.equal(location(response),'/seller?saved=business');assert.deepEqual(f.writes,[{table:'businesses',value:{display_name:'पशु Farm',legal_name:null,public_email:null,public_phone:null,website_url:null}}]);
  assert.ok(f.reads.some(row=>row[0]==='business_memberships'&&row[1]==='profile_id'&&row[2]===userId));
 }
});
test('RLS zero-row updates, mismatched receipts and update errors cannot report success or retry writes',async()=>{
 for(const options of [{zeroRows:true},{updatedId:userId},{updateError:{message:'private diagnostic'}}]){
  const f=fixture(options),response=await f.post({business_id:businessId});assert.equal(location(response),'/seller?error=save');assert.equal(f.writes.length,1);assert.ok(!(await response.text()).includes('private'));
 }
});
