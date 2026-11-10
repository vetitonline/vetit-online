import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as security from '../src/lib/api/request-security.js';
import * as validation from '../src/lib/seller/validation.js';
import * as permissions from '../src/lib/seller/permissions.js';
import * as buyerValidation from '../src/lib/buyer/validation.js';
import * as jsonBody from '../src/lib/api/json-body.js';
import * as moderation from '../src/lib/moderation/workflow.js';
import {requestSellerCatalogue} from '../src/lib/seller/catalogue-client.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),business=id(3),listing=id(4),category=id(5),species=id(6);
function route(name,{owner=bob}={}){
  let queries=0,authCalls=0;const writes=[];
  const client={auth:{getUser:async()=>{authCalls++;return{data:{user:{id:owner}}};}},from:table=>{
    queries++;let value;
    if(table==='business_memberships')value={profile_id:owner,business_id:business,member_role:'owner',membership_status:'active'};
    else if(table==='businesses')value={id:business,business_type:'individual',is_active:true,archived_at:null};
    else value={id:listing,business_id:business,kind:'product',moderation_status:'draft',archived_at:null};
    const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:value}),insert:input=>{writes.push({insert:input});return q;},single:async()=>({data:{id:listing,storage_object_path:`${business}/${listing}/${species}.png`}}),update:input=>{writes.push({update:input});return q;}};return q;
  },rpc:async(name,args)=>{writes.push({name,args});return{data:name==='moderation_open'?{caseId:listing,version:1,state:'pending'}:listing};}};
  const modules={
    '../../../lib/supabase/server':{createSupabaseServerClient:()=>client},
    '../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},
    '../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>{authCalls++;return{state:'authenticated',user:{id:owner},supabase:client};}},
    '../../../lib/supabase/proposed-commerce-rpc':{callProposedCommerceRpc:(c,name,args)=>c.rpc(name,args)},
    '../../../lib/seller/data':{getSellerTaxonomy:async()=>({state:'available',categories:[{id:category,species:[species]}]})},
    '../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,
    '../../../lib/buyer/validation.js':buyerValidation,'../../../lib/api/request-security.js':security,
    '../../../lib/api/json-body.js':jsonBody,'../../../lib/moderation/workflow.js':moderation,
    '../../../lib/seller/catalogue.js':{loadSellerCatalogue:async()=>({businesses:[],products:[]}),writeSellerCatalogue:async()=>{writes.push({catalogue:true});return{listingId:listing};}}
  };
  const source=fs.readFileSync(new URL(`../src/pages/api/seller/${name}.ts`,import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,exports={};
  new Function('require','exports',code)(key=>{assert.ok(key in modules,'Unexpected dependency '+key);return modules[key];},exports);
  return{writes,queries:()=>queries,authCalls:()=>authCalls,exports,async request({method='POST',form,body={},headers={}}={}){
    return exports[method]({request:new Request(`https://vetit.invalid/api/seller/${name}`,{method,headers:{origin:'https://vetit.invalid','content-type':form?'application/x-www-form-urlencoded':'application/json',...headers},...(!['GET','HEAD'].includes(method)?{body:form?String(form):JSON.stringify(body)}:{})}),cookies:{}});
  }};
}
const formBody=name=>new URLSearchParams(name==='business'?{display_name:'Synthetic Seller',business_type:'individual'}:name==='product'?{business_id:business,title:'Synthetic Feed',description:'Synthetic draft',category_id:category,species_ids:species,base_amount_minor:'499'}:{listing_id:listing,business_id:business});
const commands={catalogue:{action:'save',businessId:business},inventory:{businessId:business,productVariantId:listing,quantityOnHand:4},fulfilments:{fulfilmentId:listing,nextStatus:'packed'},'image-reservation':{listing_id:listing,content_type:'image/png'}};
test('account preconditions reject missing, ambiguous and invalid identities; they cannot grant ownership',()=>{
  for(const expected of [null,'',alice+','+bob,'bad']){
    const req=new Request('https://vetit.invalid',{headers:expected===null?{}:{'x-vetit-profile-id':expected}});assert.equal(security.matchesExpectedAccount(req,bob),false);
  }
  const form=new FormData();assert.equal(security.matchesFormAccount(form,bob),false);form.append('expected_profile_id',bob);assert.equal(security.matchesFormAccount(form,bob),true);form.append('expected_profile_id',bob);assert.equal(security.matchesFormAccount(form,bob),false);
});
test('stale onboarding, business edits, product drafts and submission forms cannot write under another account, even a shared business owner',async()=>{
  for(const name of ['business','product','submit'])for(const expected of [undefined,alice,'bad']){
    const f=route(name),form=formBody(name);if(expected!==undefined)form.set('expected_profile_id',expected);
    assert.equal((await f.request({form})).status,409,name);assert.equal(f.authCalls(),1);assert.equal(f.queries(),0);assert.equal(f.writes.length,0);
  }
  const f=route('business'),form=formBody('business');form.set('business_id',business);form.set('expected_profile_id',alice);assert.equal((await f.request({form})).status,409);assert.equal(f.queries(),0);
});
test('fresh same-account seller forms retain functional onboarding, draft saving and moderation submission',async()=>{
  for(const name of ['business','product','submit']){
    const f=route(name),form=formBody(name);form.set('expected_profile_id',bob);const result=await f.request({form});assert.equal(result.status,303,name);
    assert.equal(f.writes.length,1);assert.equal(f.writes[0].name,{business:'create_seller_business',product:'save_seller_product',submit:'moderation_open'}[name]);
  }
});
test('duplicate expected-account fields fail closed without seller writes',async()=>{
  for(const name of ['business','product','submit']){
    const f=route(name),form=formBody(name);form.append('expected_profile_id',bob);form.append('expected_profile_id',bob);assert.equal((await f.request({form})).status,409);assert.equal(f.writes.length,0);
  }
});
test('catalogue, legacy stock, shipment and photo APIs bind loaded identity before querying or invoking any mutation',async()=>{
  for(const [name,body] of Object.entries(commands))for(const expected of [undefined,alice,'bad']){
    const f=route(name);const response=await f.request({body,headers:{...(expected?{'x-vetit-profile-id':expected}:{}),authorization:'Bearer aaa.bbb.ccc'}});
    assert.equal(response.status,409,name);assert.equal(f.queries(),0);assert.equal(f.writes.length,0);assert.match(response.headers.get('cache-control'),/no-store/);
  }
  const f=route('image-reservation');assert.equal((await f.request({method:'DELETE',body:{image_id:listing},headers:{'x-vetit-profile-id':alice}})).status,409);assert.equal(f.writes.length,0);
});
test('same-account JSON APIs retain inventory, shipment, catalogue and photo operations',async()=>{
  for(const [name,body] of Object.entries(commands)){
    const f=route(name);const response=await f.request({body,headers:{'x-vetit-profile-id':bob}});assert.ok([200,201].includes(response.status),name);assert.equal(f.writes.length,1);
  }
  const f=route('image-reservation');assert.equal((await f.request({method:'DELETE',body:{image_id:listing},headers:{'x-vetit-profile-id':bob}})).status,200);assert.equal(f.writes[0].name,'cancel_seller_image_reservation');
});
test('shared catalogue client consumes actual handler with a verified profile and rejects a stale account before writer dispatch',async()=>{
  const f=route('catalogue');
  const read=await requestSellerCatalogue({baseUrl:'https://vetit.invalid',profileId:bob,fetchImpl:()=>f.request({method:'GET'})});assert.equal(read.profileId,bob);
  const send=profileId=>requestSellerCatalogue({baseUrl:'https://vetit.invalid',profileId,command:commands.catalogue,accessToken:'aaa.bbb.ccc',fetchImpl:async(_url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.headers['x-vetit-profile-id'],profileId);return f.request({body:JSON.parse(options.body),headers:options.headers});}});
  await assert.rejects(send(alice),{status:409});assert.equal(f.writes.length,0);assert.equal((await send(bob)).profileId,bob);assert.equal(f.writes.length,1);
});
test('catalogue transport rejects wrong-account readbacks and acknowledgements without trusting a shared business',async()=>{
  for(const command of [undefined,{action:'save'}])await assert.rejects(requestSellerCatalogue({baseUrl:'https://vetit.invalid',profileId:alice,command,fetchImpl:async()=>Response.json({apiVersion:1,data:{profileId:bob,listingId:listing,businesses:[{id:business}]}})}),{status:409});
  let calls=0;await assert.rejects(requestSellerCatalogue({baseUrl:'https://vetit.invalid',command:{action:'save'},fetchImpl:async()=>{calls++;}}),{status:400});assert.equal(calls,0);
});
test('SSR forms include the verified account and all seller editor entry points load invalidation protection',()=>{
  for(const name of ['onboarding','index','products/new','products/[id]']){
    const source=fs.readFileSync(new URL(`../src/pages/seller/${name}.astro`,import.meta.url),'utf8');assert.match(source,/data-seller-account data-profile-id=/);assert.match(source,/account-page\.ts/);
    if(!name.endsWith('new'))assert.match(source,/expected_profile_id/);
  }
  const component=fs.readFileSync(new URL('../src/components/seller/SellerProductForm.astro',import.meta.url),'utf8');assert.match(component,/name="expected_profile_id" value=\{profileId\}/);assert.match(component,/'x-vetit-profile-id': String\(payload.get\('expected_profile_id'\)\)/);
});
