import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as validation from '../src/lib/seller/validation.js';
import * as permissions from '../src/lib/seller/permissions.js';
import * as security from '../src/lib/api/request-security.js';
import {normalizeCatalogueSave} from '../src/lib/seller/catalogue-contract.js';
const user='10000000-0000-4000-8000-000000000001',business='20000000-0000-4000-8000-000000000001',listing='40000000-0000-4000-8000-000000000001';
const category='30000000-0000-4000-8000-000000000001',animal='70000000-0000-4000-8000-000000000001';
const categories=[{id:category,species:[animal]}],taxonomy=new Map([[category,new Set([animal])]]);
function form(){const f=new FormData();for(const [key,value] of Object.entries({business_id:business,title:'पशु आहार',description:'Synthetic feed',category_id:category,species_ids:animal,base_amount_minor:'',variant_sku:'FEED-1',variant_name:'Size',variant_value:'छोटा',variant_amount_minor:'10'}))f.set(key,value);return f;}
function fixture(options={}){
 const calls=[];let authCalls=0;
 const client={from:table=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:table==='business_memberships'?{profile_id:user,business_id:business,member_role:'owner',membership_status:'active',...options.membership}:table==='businesses'?{id:business,is_active:true,archived_at:null,...options.business}:{business_id:business,kind:'product',archived_at:null,moderation_status:'draft',...options.listing}})};return query;},rpc:async(name,args)=>{calls.push({name,args});return{data:options.savedId===undefined?listing:options.savedId,error:options.rpcError};}};
 const modules={
  '../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>{authCalls++;return{state:options.authState??'authenticated',user:{id:user},supabase:client};}},
  '../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},
  '../../../lib/seller/data':{getSellerTaxonomy:async()=>({state:'available',categories})},
  '../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':security,
 };
 const source=fs.readFileSync(new URL('../src/pages/api/seller/product.ts',import.meta.url),'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',output)(name=>{assert.ok(name in modules);return modules[name];},exports);
 return {calls,authCalls:()=>authCalls,post:(body=form(),headers={})=>exports.POST({request:new Request('http://localhost:4321/api/seller/product',{method:'POST',headers:{origin:'http://localhost:4321',accept:'application/json',...headers},body}),cookies:{}})};
}
test('shared validator rejects File-valued repeated fields rather than coercing labels into JSONB',()=>{
 for(const field of ['species_ids','variant_sku','variant_name','variant_value','variant_amount_minor']){const f=form();f.set(field,new Blob(['not text input']),'field.txt');assert.throws(()=>validation.sellerProductInput(f,taxonomy),/bounded text/);}
});
test('shared validator bounds raw repeated values before deduplication or blank-row skipping',()=>{
 for(const field of ['species_ids','variant_sku','variant_name','variant_value','variant_amount_minor']){
  const f=form();f.delete(field);for(let i=0;i<21;i++)f.append(field,field==='species_ids'?animal:'');assert.throws(()=>validation.sellerProductInput(f,taxonomy),/at most 20/);
  const long=form();long.set(field,' '.repeat(5001));assert.throws(()=>validation.sellerProductInput(long,taxonomy),/bounded text/);
 }
});
test('browser and native normalization preserve matching regional text, variants and admin category restrictions',()=>{
 const f=form(),fields={};for(const key of ['title','description','category_id','base_amount_minor'])fields[key]=f.get(key);
 for(const key of ['species_ids','variant_sku','variant_name','variant_value','variant_amount_minor'])fields[key]=f.getAll(key);
 assert.deepEqual(normalizeCatalogueSave({businessId:business,fields},categories).product,validation.sellerProductInput(f,taxonomy));
 assert.equal(validation.sellerProductInput(f,taxonomy).variants[0].option_attributes.Size,'छोटा');
 assert.throws(()=>validation.sellerProductInput(f,new Map()));
 const base=form();for(const key of ['variant_sku','variant_name','variant_value','variant_amount_minor'])base.delete(key);base.set('base_amount_minor','10');assert.equal(validation.sellerProductInput(base,taxonomy).baseAmountMinor,1000);
});
test('the supported twenty-variant boundary and empty optional rows remain compatible',()=>{
 const f=form();for(const key of ['variant_sku','variant_name','variant_value','variant_amount_minor'])f.delete(key);
 for(let i=0;i<20;i++){f.append('variant_sku','SKU-'+i);f.append('variant_name','Size');f.append('variant_value','M-'+i);f.append('variant_amount_minor','10');}
 assert.equal(validation.sellerProductInput(f,taxonomy).variants.length,20);
 const base=form();base.set('base_amount_minor','10');for(const key of ['variant_sku','variant_name','variant_value','variant_amount_minor'])base.set(key,'');assert.equal(validation.sellerProductInput(base,taxonomy).variants.length,0);
});
test('actual multipart route rejects non-text/oversized rows before any RPC write',async()=>{
 for(const field of ['variant_name','variant_value']){const f=form();f.set(field,new Blob(['private file contents']),'field.txt');const r=fixture(),response=await r.post(f);assert.equal(response.status,422);assert.equal(r.calls.length,0);assert.ok(!(await response.text()).includes('private'));}
 const f=form();for(let i=0;i<21;i++)f.append('variant_name','');const r=fixture();assert.equal((await r.post(f)).status,422);assert.equal(r.calls.length,0);
});
test('actual draft route distinguishes Auth outage from sign-out without attempting a write',async()=>{
 for(const accept of ['application/json','text/html']){const r=fixture({authState:'unavailable'}),response=await r.post(form(),{accept});assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(r.calls.length,0);}
 const r=fixture({authState:'unauthenticated'}),response=await r.post();assert.equal(response.status,303);assert.match(response.headers.get('location'),/\/login\?/);assert.equal(r.calls.length,0);
});
test('draft route preserves origin, business membership and reviewed-listing authorization boundaries',async()=>{
 const cross=fixture();assert.equal((await cross.post(form(),{origin:'https://foreign.invalid'})).status,403);assert.equal(cross.authCalls(),0);
 for(const options of [{membership:{profile_id:listing}},{membership:{business_id:listing}},{membership:{member_role:'viewer'}},{membership:{membership_status:'suspended'}},{business:{is_active:false}},{business:{archived_at:'2026-01-01'}},{listing:{kind:'service'}},{listing:{moderation_status:'submitted'}},{listing:{moderation_status:'published'}},{listing:{business_id:listing}},{listing:{archived_at:'2026-01-01'}}]){const r=fixture(options),f=form();f.set('listing_id',listing);assert.equal((await r.post(f)).status,403);assert.equal(r.calls.length,0);}
});
test('only valid matching save receipts report success; uncertain writes remain unconfirmed',async()=>{
 for(const savedId of [null,'invalid',{id:listing},business]){const r=fixture({savedId}),f=form();f.set('listing_id',listing);const response=await r.post(f);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'draft_save_unconfirmed'});assert.equal(r.calls.length,1);}
 const r=fixture(),response=await r.post();assert.equal(response.status,201);assert.deepEqual(await response.json(),{listingId:listing});assert.equal(r.calls[0].name,'save_seller_product');assert.equal(r.calls[0].args.p_variants[0].amount_minor,1000);assert.ok(!('moderation_status' in r.calls[0].args));
 const mixedId='4abc0000-0000-4000-8000-000000000001';const manager=fixture({membership:{member_role:'catalog_manager'},savedId:mixedId}),edit=form();edit.set('listing_id',mixedId.toUpperCase());assert.equal((await manager.post(edit)).status,201);
 const conflict=fixture({rpcError:{code:'23505',message:'private diagnostic'}});const denied=await conflict.post();assert.equal(denied.status,409);assert.ok(!(await denied.text()).includes('private'));
});
