import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as validation from '../src/lib/seller/validation.js';
import * as permissions from '../src/lib/seller/permissions.js';
import * as security from '../src/lib/api/request-security.js';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const category='30000000-0000-4000-8000-000000000001',species='70000000-0000-4000-8000-000000000001';
function form(values={}){const result=new FormData();for(const [key,value]of Object.entries(values)){for(const item of Array.isArray(value)?value:[value])result.append(key,item);}return result;}
const product=overrides=>form({title:'कुत्तों का भोजन',description:'भारत के लिए उत्पाद',category_id:category,species_ids:species,base_amount_minor:'499',...overrides});
const taxonomy=new Map([[category,new Set([species])]]);
test('Hindi-only listing titles retain content, use stable DB-compatible identifiers and keep INR conversion',()=>{
 const input=validation.sellerProductInput(product(),taxonomy);assert.equal(input.title,'कुत्तों का भोजन');assert.equal(input.baseAmountMinor,49900);assert.match(input.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(input.slug.length<=100);assert.equal(input.slug,validation.sellerProductInput(product(),taxonomy).slug);assert.notEqual(input.slug,validation.slugifySellerProduct('कुत्तों का नया भोजन'));
 assert.equal(validation.slugifySellerProduct('Cattle Feed'),'cattle-feed');assert.equal(validation.slugifySellerProduct('***'),'');
});
test('slug truncation does not reject otherwise valid long English titles',()=>{
 const input=validation.sellerProductInput(product({title:'a'.repeat(99)+' b'}),taxonomy);assert.ok(input.slug.length<=100);assert.ok(!input.slug.endsWith('-'));
});
test('listing validation rejects duplicate scalar fields, files and malformed UUID-shaped identifiers',()=>{
 const duplicate=product();duplicate.append('category_id',category);assert.throws(()=>validation.sellerProductInput(duplicate,taxonomy),/duplicate/);
 const file=product();file.set('title',new Blob(['synthetic file']),'synthetic.txt');assert.throws(()=>validation.sellerProductInput(file,taxonomy),/text/);
 assert.throws(()=>validation.sellerProductInput(product({category_id:'-'.repeat(36)}),new Map([['-'.repeat(36),new Set()]])),/category/);
 assert.throws(()=>validation.sellerProductInput(product({species_ids:'-'.repeat(36)}),new Map([[category,new Set()]])),/livestock/);
});
test('business inputs reject ambiguous contacts and credential URLs while retaining valid optional Indian contacts',()=>{
 for(const phone of ['call me','()--()--','9'.repeat(16)])assert.throws(()=>validation.sellerBusinessInput(form({display_name:'स्थानीय विक्रेता',public_phone:phone})),/phone/);
 const input=validation.sellerBusinessInput(form({display_name:'स्थानीय विक्रेता',public_phone:'+91 98765 43210',website_url:'https://example.invalid/shop'}));assert.equal(input.publicPhone,'+91 98765 43210');
 assert.throws(()=>validation.sellerBusinessInput(form({display_name:'Synthetic seller',website_url:'https://synthetic-user:synthetic-value@example.invalid'})),/credentials/);
 const duplicate=form({display_name:['One seller','Different seller']});assert.throws(()=>validation.sellerBusinessInput(duplicate),/duplicate/);
 assert.equal(validation.sellerBusinessInput(form({display_name:'Synthetic seller'})).publicPhone,null);
});
function route(kind,{role='owner',state='draft',owner=id,authenticated=true,fail=false,rpcError=null}={}){
 const writes=[],logs=[];let queries=0;
 const client={auth:{getUser:async()=>({data:{user:authenticated?{id}:null}})},from:table=>{
  queries++;const data=table==='business_memberships'?{profile_id:id,business_id:id,member_role:role,membership_status:'active'}:table==='businesses'?{id,business_type:'farm',is_active:true,archived_at:null}:{business_id:owner,kind:'product',archived_at:null,moderation_status:state};
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data}),update:values=>{writes.push({update:values});return{eq:async()=>({error:null})};}};return q;
 },rpc:async(name,args)=>{writes.push({name,args});if(fail)throw Error('synthetic private diagnostic');return{data:rpcError?null:id,error:rpcError};}};
 const modules={'../../../lib/supabase/server':{createSupabaseServerClient:()=>client},'../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},'../../../lib/seller/data':{getSellerTaxonomy:async()=>({state:'available',categories:[{id:category,species:[species]}]})},'../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':security};
 const source=fs.readFileSync(new URL(`../src/pages/api/seller/${kind}.ts`,import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports','console',compiled)(name=>{if(!(name in modules))throw Error('Unexpected dependency');return modules[name];},exports,{error:(...parts)=>logs.push(parts.join(' '))});
 return{writes,logs,queries:()=>queries,post:async(values,origin='http://localhost:4321',accept='text/html')=>{const body=new URLSearchParams();for(const [key,value]of Object.entries(values))for(const item of Array.isArray(value)?value:[value])body.append(key,item);return exports.POST({request:new Request(`http://localhost:4321/api/seller/${kind}`,{method:'POST',headers:{origin,accept,'content-type':'application/x-www-form-urlencoded'},body}),cookies:{}});}};
}
test('actual routes reject malformed/ambiguous seller identifiers before business queries or writes',async()=>{
 for(const kind of ['business','product'])for(const business_id of ['-'.repeat(36),[id,other]]){const r=route(kind);assert.equal((await r.post({business_id})).status,400);assert.equal(r.queries(),0);assert.equal(r.writes.length,0);}
});
test('Hindi product drafts use only validated RPC fields and reject published/cross-business edits',async()=>{
 const values={business_id:id,title:'कुत्तों का भोजन',category_id:category,species_ids:species,base_amount_minor:'499',moderation_status:'published'};
 const r=route('product');assert.equal((await r.post(values)).status,303);assert.equal(r.writes[0].name,'save_seller_product');assert.equal(r.writes[0].args.p_title,values.title);assert.equal(r.writes[0].args.p_base_amount_minor,49900);assert.ok(!('moderation_status'in r.writes[0].args));
 for(const options of [{state:'published'},{owner:other},{role:'viewer'}]){const denied=route('product',options);assert.equal((await denied.post({...values,listing_id:id})).status,403);assert.equal(denied.writes.length,0);}
});
test('business creation/update preserve verification and business-type approval restrictions',async()=>{
 const r=route('business');assert.equal((await r.post({display_name:'स्थानीय विक्रेता',business_type:'farm',verification_status:'verified'})).status,303);assert.equal(r.writes[0].name,'create_seller_business');assert.ok(!('verification_status'in r.writes[0].args));
 const updated=route('business');assert.equal((await updated.post({business_id:id,display_name:'Updated seller',business_type:'company',verification_status:'verified'})).status,303);assert.ok(!('business_type'in updated.writes[0].update));assert.ok(!('verification_status'in updated.writes[0].update));
 const denied=route('business',{role:'catalog_manager'});assert.equal((await denied.post({business_id:id,display_name:'Denied update'})).status,403);assert.equal(denied.writes.length,0);
});
test('seller routes reject cross-origin/authless writes and sanitise caught diagnostics',async()=>{
 for(const kind of ['business','product']){const cross=route(kind);assert.equal((await cross.post({},'https://untrusted.invalid')).status,403);assert.equal(cross.queries(),0);const signedOut=route(kind,{authenticated:false});assert.equal((await signedOut.post({})).status,303);assert.equal(signedOut.writes.length,0);}
 const failed=route('business',{fail:true});await failed.post({display_name:'Synthetic seller'});assert.equal(failed.logs.length,1);assert.ok(!failed.logs[0].includes('private diagnostic'));
});
test('product API separates validation, conflict and uncertain save outcomes without exposing input or diagnostics',async()=>{
 const values={business_id:id,title:'Synthetic draft',category_id:category,species_ids:species,base_amount_minor:'499'};
 const invalid=route('product');const bad=await invalid.post({...values,base_amount_minor:'invalid'},undefined,'application/json');assert.equal(bad.status,422);assert.equal(invalid.writes.length,0);
 const uncertain=route('product',{fail:true});const lost=await uncertain.post(values,undefined,'application/json');assert.equal(lost.status,503);assert.deepEqual(await lost.json(),{error:'draft_save_unconfirmed'});assert.equal(uncertain.writes.length,1);
 const conflict=route('product',{rpcError:{code:'23505',message:'private duplicate detail'}});const duplicate=await conflict.post(values,undefined,'application/json');assert.equal(duplicate.status,409);assert.deepEqual(await duplicate.json(),{error:'draft_conflict'});assert.match(duplicate.headers.get('cache-control'),/no-store/);
});
