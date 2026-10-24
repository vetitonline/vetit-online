import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as validation from '../src/lib/seller/validation.js';
import * as revision from '../src/lib/seller/catalogue-revision.js';
import * as permissions from '../src/lib/seller/permissions.js';
import * as requestSecurity from '../src/lib/api/request-security.js';
import {sellerProductInput,sellerProductValidationIssue} from '../src/lib/seller/validation.js';
import {normalizeCatalogueSave} from '../src/lib/seller/catalogue-contract.js';
import {clearSellerFieldFeedback,showSellerFieldFeedback} from '../src/lib/seller/field-feedback.js';
import {createNativeSellerCatalogue,filterNativeSellerCatalogue} from '../mobile/src/seller-catalogue.js';
import {sellerCatalogueCopy} from '../src/lib/seller/catalogue-copy.js';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const business=id(1),category=id(2),species=id(3),listing=id(4),user=id(5);
const categories=[{id:category,label:'Feed',species:[species]}];
const fields=()=>({title:'தமிழ் Feed',description:'Details',category_id:category,species_ids:[species],base_amount_minor:'100',variant_sku:[],variant_name:[],variant_value:[],variant_amount_minor:[]});
const form=value=>{const f=new FormData();for(const [key,v]of Object.entries(value))for(const item of Array.isArray(v)?v:[v])f.append(key,item);return f;};
const variant={base_amount_minor:'',variant_sku:['SKU'],variant_name:['Size'],variant_value:['1kg'],variant_amount_minor:['100']};
test('web and native identify the same first invalid field and variant row without changing input',()=>{
 for(const [patch,field,index] of [
  [{title:'x'},'title'],[{description:'x'.repeat(5001)},'description'],[{category_id:''},'category_id'],[{category_id:id(99)},'category_id'],[{species_ids:[]},'species_ids'],[{species_ids:[id(99)]},'species_ids'],[{base_amount_minor:'1.5'},'base_amount_minor'],[{base_amount_minor:''},'base_amount_minor'],
  [{...variant,variant_sku:['']},'variant_sku',0],[{...variant,variant_name:['']},'variant_name',0],[{...variant,variant_value:['']},'variant_value',0],[{...variant,variant_amount_minor:['0']},'variant_amount_minor',0],
  [{...variant,base_amount_minor:'100'},'base_amount_minor'],[{...variant,variant_sku:['bad/sku']},'variant_sku',0],
  [{base_amount_minor:'',variant_sku:['','A',' a '],variant_name:['','Size','Size'],variant_value:['','1kg','2kg'],variant_amount_minor:['','10','20']},'variant_sku',2],
 ]){
  const value={...fields(),...patch},before=JSON.stringify(value),f=form(value);let webIssue,nativeIssue;
  try{sellerProductInput(f,new Map([[category,new Set([species])]]));assert.fail('Expected web rejection');}catch(error){webIssue=sellerProductValidationIssue(error);}
  try{normalizeCatalogueSave({businessId:business,fields:value},categories);assert.fail('Expected native rejection');}catch(error){nativeIssue=error.fieldIssue;}
  // Malformed oversized scalar envelopes intentionally stay a generic 400 in native.
  if(field!=='description')assert.deepEqual(nativeIssue,webIssue);
  assert.equal(webIssue.field,field);assert.equal(webIssue.index,index);assert.equal(JSON.stringify(value),before);
 }
});
test('unknown exceptions never become public field diagnostics and valid normalization is unchanged',()=>{
 assert.equal(sellerProductValidationIssue(Error('private provider details')),null);
 assert.equal(normalizeCatalogueSave({businessId:business,fields:fields()},categories).product.baseAmountMinor,10000);
});
class Node{
 constructor(){this.attrs={};this.children=[];this.value='unsaved';this.parentElement=this;}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 append(n){n.parentElement=this;this.children.push(n);}remove(){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}focus(){this.focused=true;}closest(){return null;}
}
function dom(){
 const root=new Node(),inputs=[new Node(),new Node()];for(const input of inputs)input.parentElement=root;
 const form={ownerDocument:{createElement:()=>new Node()},querySelector:()=>null,querySelectorAll:selector=>selector==='[data-seller-field-error]'?root.children:selector==='[aria-describedby]'?inputs.filter(i=>i.getAttribute('aria-describedby')):selector==='[data-seller-invalid]'?inputs.filter(i=>i.getAttribute('data-seller-invalid')!==null):selector==='[name="variant_amount_minor"]'?inputs:[]};
 return{root,inputs,form};
}
test('web inline errors use text, focus the exact row and preserve values/existing descriptions',()=>{
 const {form,inputs,root}=dom();inputs[1].setAttribute('aria-describedby','existing-help');
 assert.equal(showSellerFieldFeedback(form,{field:'variant_amount_minor',index:1,message:'Enter a whole INR amount.'}),true);
 assert.equal(inputs[1].getAttribute('aria-invalid'),'true');assert.equal(inputs[1].focused,true);assert.equal(inputs[1].value,'unsaved');assert.equal(root.children[0].textContent,'Enter a whole INR amount.');
 clearSellerFieldFeedback(form);assert.equal(inputs[1].getAttribute('aria-describedby'),'existing-help');assert.equal(inputs[1].getAttribute('aria-invalid'),null);assert.equal(root.children.length,0);
 assert.equal(showSellerFieldFeedback(form,{field:'secret',message:'not a valid field'}),false);assert.equal(showSellerFieldFeedback(form,{field:'variant_amount_minor',index:25,message:'invalid row'}),false);
});
function native(){
 const session={snapshot:()=>({userId:user}),subscribe:()=>()=>{},getSession:async()=>({userId:user,accessToken:'synthetic-only'})};let writes=0;
 const data={businesses:[{id:business,name:'Seller'}],animals:[{id:species,label:'Dog'}],categories,products:[{id:listing,businessId:business,status:'draft',revision:'1',updatedAt:'2026-10-24T09:00:00Z',editable:true,imageCount:0,fields:fields()}]};
 const ui=mountNativeComponent('NativeSellerCatalogue.tsx','NativeSellerCatalogue',{session,apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'},{'./seller-catalogue.js':{filterNativeSellerCatalogue,createNativeSellerCatalogue:options=>createNativeSellerCatalogue({...options,request:async input=>{if(input.command)writes++;return data;}})},'../../src/lib/seller/catalogue-copy.js':{sellerCatalogueCopy},'../../src/lib/supabase/test-endpoints.js':{resolveMobileApiBase}});
 return{ui,writes:()=>writes};
}
test('native invalid fields show local alerts/hints, retain edits, and permit correction without a POST',async()=>{
 const {ui,writes}=native();await drainNativeTasks();ui.render();ui.button('Edit draft: தமிழ் Feed').props.onPress();ui.render();ui.input('Product name','x');ui.button('Review draft save').props.onPress();ui.render();
 const input=ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product name');assert.equal(input.props.value,'x');assert.match(input.props.accessibilityHint,/between 3 and 160/);assert.match(ui.text(),/between 3 and 160/);assert.equal(writes(),0);
 ui.input('Product name','Corrected தமிழ் feed');ui.button('Review draft save').props.onPress();ui.render();assert.match(ui.text(),/Confirm seller change/);assert.ok(!ui.text().includes('between 3 and 160'));assert.equal(writes(),0);ui.unmount();
});
test('native variant price errors attach to the correct row without clearing other fields',async()=>{
 const {ui,writes}=native();await drainNativeTasks();ui.render();ui.button('Edit draft: தமிழ் Feed').props.onPress();ui.render();ui.input('One product price (whole INR)','');ui.button('Add priced variant').props.onPress();ui.render();
 for(const [label,value]of [['Seller SKU 1','SKU'],['Option name 1','Size'],['Option value 1','1kg'],['Variant price (whole INR) 1','0']])ui.input(label,value);
 ui.button('Review draft save').props.onPress();ui.render();const input=ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Variant price (whole INR) 1');assert.equal(input.props.value,'0');assert.match(input.props.accessibilityHint,/whole INR/);assert.equal(writes(),0);ui.unmount();
});
test('native category/species selection errors are adjacent alerts and never create a draft',async()=>{
 const {ui,writes}=native();await drainNativeTasks();ui.render();ui.button('New product draft: Seller').props.onPress();ui.render();ui.input('Product name','New feed');ui.input('One product price (whole INR)','100');
 ui.button('Review draft save').props.onPress();ui.render();assert.match(ui.text(),/Choose a product category/);
 ui.button('Feed').props.onPress();ui.render();ui.button('Review draft save').props.onPress();ui.render();assert.match(ui.text(),/Choose between 1 and 8/);
 ui.button('Dog').props.onPress();ui.render();ui.button('Review draft save').props.onPress();ui.render();assert.match(ui.text(),/Confirm seller change/);assert.equal(writes(),0);ui.unmount();
});
test('actual web route returns only typed field feedback before RPC and redacts unknown failures',async()=>{
 let writes=0,unavailable=false;
 const client={from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='business_memberships'?{profile_id:user,business_id:business,member_role:'owner',membership_status:'active'}:{id:business,is_active:true,archived_at:null},error:null})};return q;},rpc:()=>{writes++;throw Error('Should not send invalid draft');}};
 const modules={'../../../lib/seller/catalogue-revision.js':revision,'../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>({state:'authenticated',user:{id:user},supabase:client})},'../../../lib/supabase/config':{getSupabasePublicConfig:()=>true},'../../../lib/seller/data':{getSellerTaxonomy:async()=>{if(unavailable)throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');return{state:'available',categories};}},'../../../lib/seller/validation.js':validation,'../../../lib/seller/permissions.js':permissions,'../../../lib/api/request-security.js':requestSecurity};
 const source=fs.readFileSync(new URL('../src/pages/api/seller/product.ts',import.meta.url),'utf8');const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',output)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
 const post=()=>exports.POST({request:new Request('http://localhost:4321/api/seller/product',{method:'POST',headers:{origin:'http://localhost:4321',accept:'application/json'},body:form({...fields(),business_id:business,title:'x'})}),cookies:{}});
 let response=await post();assert.equal(response.status,422);const body=await response.json();assert.equal(body.fieldIssue.field,'title');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(writes,0);
 unavailable=true;response=await post();const privateBody=await response.text();assert.ok(!privateBody.includes('PRIVATE_PROVIDER_DIAGNOSTIC'));assert.ok(!privateBody.includes('fieldIssue'));assert.equal(writes,0);
});
