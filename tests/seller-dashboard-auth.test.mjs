import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {hasSellerCatalogRole} from '../src/lib/seller/permissions.js';
const source=fs.readFileSync(new URL('../src/lib/seller/data.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(state,{error=null}={}) {
 const reads=[];let authCalls=0;
 const client={from:table=>{reads.push(table);const query={select:()=>query,eq:()=>query,then:resolve=>resolve({data:[],error})};return query;},rpc:()=>{throw Error('No seller business should be loaded');}};
 const modules={
  '../supabase/server':{createSupabaseServerClient:()=>client},
  '../supabase/api-auth':{authenticateApiRequest:async()=>{authCalls++;return{state,supabase:client,user:{id:'verified-user'}};}},
  '../marketplace/featured-products':{getProductTaxonomy:()=>{throw Error('No taxonomy needed');}},
  '../supabase/config':{getSupabasePublicConfig:()=>null},'./permissions.js':{hasSellerCatalogRole},
 };
 const exports={};new Function('require','exports',output)(name=>{assert.ok(name in modules);return modules[name];},exports);
 return {reads,authCalls:()=>authCalls,load:()=>exports.loadSellerDashboard(new Request('http://localhost/seller/onboarding'),{})};
}
test('seller pages receive an unavailable state via throw rather than a false signed-out identity',async()=>{
 const f=fixture('unavailable');await assert.rejects(f.load(),/temporarily unavailable/);assert.deepEqual(f.reads,[]);assert.equal(f.authCalls(),1);
});
test('absent identity returns a signed-out dashboard without reading seller data',async()=>{
 const f=fixture('unauthenticated'),dashboard=await f.load();assert.equal(dashboard.user,null);assert.deepEqual(dashboard.businesses,[]);assert.deepEqual(f.reads,[]);assert.equal(f.authCalls(),1);
});
test('verified new account can reach onboarding with no memberships and no business RPC',async()=>{
 const f=fixture('authenticated'),dashboard=await f.load();assert.equal(dashboard.user.id,'verified-user');assert.deepEqual(dashboard.memberships,[]);assert.deepEqual(f.reads,['business_memberships']);assert.equal(f.authCalls(),1);
});
test('membership service errors remain unavailable rather than an empty seller workspace',async()=>{
 const f=fixture('authenticated',{error:Error('synthetic membership outage')});await assert.rejects(f.load(),/membership outage/);
});
