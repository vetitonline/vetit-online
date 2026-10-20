// Actual route source; synthetic identity/query responses, no DB or environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as permissions from '../src/lib/seller/permissions.js';
import * as security from '../src/lib/api/request-security.js';
import * as workflow from '../src/lib/moderation/workflow.js';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
function fixture({state='draft',owner=id,role='owner',active=true}={}){
 const writes=[];let authCalls=0;
 const client={auth:{getUser:async()=>{authCalls++;return{data:{user:{id}}};}},from:table=>{
  const data=table==='business_memberships'?{profile_id:id,business_id:id,member_role:role,membership_status:'active'}:table==='businesses'?{id,is_active:active,archived_at:null}:{business_id:owner,kind:'product',moderation_status:state};
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data})};return query;
 },rpc:async(name,args)=>{writes.push({name,args});return{data:{caseId:id,version:1,state:'pending'}};}};
 const modules={'../../../lib/supabase/server':{createSupabaseServerClient:()=>client},'../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':security,'../../../lib/moderation/workflow.js':workflow};
 const source=fs.readFileSync(new URL('../src/pages/api/seller/submit.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected dependency');return modules[name];},exports);
 return{writes,authCalls:()=>authCalls,post:async(body=`listing_id=${id}&business_id=${id}`,origin='http://localhost:4321')=>exports.POST({request:new Request('http://localhost:4321/api/seller/submit',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body}),cookies:{}})};
}
test('seller route rejects malformed and duplicate identifiers before authentication or writes',async()=>{
 for(const body of [`listing_id=${'-'.repeat(36)}&business_id=${id}`,`listing_id=${id}&listing_id=${other}&business_id=${id}`,`listing_id=${id}&business_id=${id}&business_id=${other}`]){const f=fixture();assert.equal((await f.post(body)).status,400);assert.equal(f.authCalls(),0);assert.equal(f.writes.length,0);}
});
test('seller route preserves ownership, role, active business and publication restrictions',async()=>{
 for(const options of [{owner:other},{role:'viewer'},{active:false},{state:'published'},{state:'submitted'}]){const f=fixture(options);assert.equal((await f.post()).status,403);assert.equal(f.writes.length,0);}
 const f=fixture();assert.equal((await f.post(undefined,'https://untrusted.invalid')).status,403);assert.equal(f.authCalls(),0);
});
test('draft and rejected submissions only call atomic durable moderation operation',async()=>{
 for(const state of ['draft','rejected']){const f=fixture({state});const result=await f.post();assert.equal(result.status,303);assert.deepEqual(f.writes,[{name:'moderation_open',args:{p_kind:'product',p_subject:id}}]);}
});
