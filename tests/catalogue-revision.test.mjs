import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {isCatalogueRevision,validCatalogueReceipt} from '../src/lib/seller/catalogue-revision.js';
import * as revision from '../src/lib/seller/catalogue-revision.js';
import * as security from '../src/lib/api/request-security.js';
import * as validation from '../src/lib/seller/validation.js';
import * as permissions from '../src/lib/seller/permissions.js';
const id='91000000-0000-4000-8000-000000000001',other='91000000-0000-4000-8000-000000000002';
test('opaque bigint revisions reject numbers, dates, overflow and noncanonical decimals',()=>{
 for(const v of ['1','9007199254740993','9223372036854775807'])assert.equal(isCatalogueRevision(v),true);
 for(const v of [1,0,null,{},'0','01','-1','1.0','1e2',' 1','1\n','9223372036854775808','2026-10-22'])assert.equal(isCatalogueRevision(v),false);
 const receipt={apiVersion:2,listingId:id,revision:'9007199254740994'};
 assert.equal(validCatalogueReceipt(receipt,id,'9007199254740993'),true);
 for(const patch of [{apiVersion:1},{listingId:other},{revision:'9007199254740993'},{revision:9007199254740994}])assert.equal(validCatalogueReceipt({...receipt,...patch},id,'9007199254740993'),false);
});
function route({rpcError=null,receipt={apiVersion:2,listingId:id,revision:'2'},owner=id}={}){
 const calls=[];const client={from:table=>{const data=table==='business_memberships'?{profile_id:id,business_id:id,member_role:'owner',membership_status:'active'}:table==='businesses'?{id,is_active:true,archived_at:null}:{business_id:owner,kind:'product',moderation_status:'draft'};const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:receipt,error:rpcError};}};
 const modules={'../../../lib/seller/catalogue-revision.js':revision,'../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>({state:'authenticated',supabase:client,user:{id}})},'../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},'../../../lib/seller/data':{getSellerTaxonomy:async()=>({state:'available',categories:[{id,species:[id]}]})},'../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':security};
 const source=fs.readFileSync(new URL('../src/pages/api/seller/product.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('require','exports',compiled)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
 return{calls,post:async(expected='1')=>{const form=new URLSearchParams({business_id:id,listing_id:id,title:'Synthetic feed',description:'Synthetic',category_id:id,species_ids:id,base_amount_minor:'499'});if(expected!==null)form.set('expected_revision',expected);return exports.POST({request:new Request('http://localhost:4321/api/seller/product',{method:'POST',headers:{origin:'http://localhost:4321','content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:form}),cookies:{}});}};
}
test('actual web form route forwards the original opaque revision and validates its receipt',async()=>{
 const f=route();const r=await f.post();assert.equal(r.status,201);assert.deepEqual(await r.json(),{listingId:id,revision:'2'});assert.equal(f.calls[0].name,'save_seller_product_v2');assert.equal(f.calls[0].args.p_expected_revision,'1');
 for(const token of [null,'0','9223372036854775808']){const bad=route();assert.equal((await bad.post(token)).status,409);assert.equal(bad.calls.length,0);}
});
test('actual web form conflicts and foreign ownership fail closed without retry',async()=>{
 for(const code of ['PT409','40001','40P01']){const f=route({rpcError:{code,message:'private row details'}});const r=await f.post();assert.equal(r.status,409);assert.equal((await r.json()).state,'conflict');assert.equal(f.calls.length,1);}
 const foreign=route({owner:other});assert.equal((await foreign.post()).status,403);assert.equal(foreign.calls.length,0);
 const stale=route({receipt:{apiVersion:2,listingId:id,revision:'1'}});assert.equal((await stale.post()).status,503);assert.equal(stale.calls.length,1);
});
