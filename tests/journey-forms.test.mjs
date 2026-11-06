import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { selectProductOption } from '../src/lib/commerce/product-selection.js';
import { normalizeQuoteLines } from '../src/lib/commerce/checkout-quote.js';
const id='10000000-0000-4000-8000-000000000001',variant='10000000-0000-4000-8000-000000000002';
class Node{
  constructor(){this.children=[];this.events={};this.attributes={};this.dataset={};this.value='';this.textContent='';this.disabled=false;}
  addEventListener(name,fn){this.events[name]=fn;}
  append(child){this.children.push(child);}
  replaceChildren(){this.children=[];}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];if(name==='href')delete this.href;}
  set innerHTML(_){throw Error('Unsafe rendering');}
}
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('actual product form updates variant, quantity, price and saved-cart handoff and disables excess stock',()=>{
  const nodes=new Map(['product-selection','product-option','product-quantity','product-save-option','product-selection-status'].map(name=>[name,new Node()]));
  const button=new Node(),host=nodes.get('product-selection');host.querySelector=()=>button;host.dataset={productId:id,options:JSON.stringify([{variantId:variant,label:'Size M · Blue',priceMinor:12500,stockQuantity:3},{variantId:null,label:'Standard',priceMinor:10000,stockQuantity:null}])};
  nodes.get('product-quantity').value='1';
  const source=fs.readFileSync(new URL('../src/pages/products/[id].astro',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function('require','exports','document',compile(source))(()=>({selectProductOption}),{},{getElementById:name=>nodes.get(name)});
  assert.equal(button.disabled,true);
  const choice=nodes.get('product-option'),qty=nodes.get('product-quantity');choice.value=variant;qty.value='2';choice.events.change();
  assert.equal(button.disabled,false);assert.equal(host.dataset.productVariantId,variant);assert.equal(host.dataset.productQuantity,'2');assert.equal(host.dataset.productPricePaise,'12500');
  assert.equal(new URL(nodes.get('product-save-option').href,'https://test.invalid').searchParams.get('productVariantId'),variant);
  qty.value='4';qty.events.input();assert.equal(button.disabled,true);assert.equal(nodes.get('product-save-option').href,undefined);assert.match(nodes.get('product-selection-status').textContent,/stock/);
});
async function checkout({source='browser',read,review}={}){
  const nodes=new Map(['checkout-details','checkout-details-status','checkout-details-summary'].map(name=>[name,new Node()]));
  const form=nodes.get('checkout-details'),button=new Node();form.querySelector=()=>button;
  let fields={source,email:'customer@example.in',recipientName:'Asha',phone:'9876543210',addressLine1:'1 Test Road',addressLine2:'',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001'};
  form.reset=()=>{fields={};};
  const calls=[],events={};let auth;
  const modules={
    './checkout-review-client.js':{requestCheckoutReview:review??(async input=>{calls.push(input);return{profileId:id,summary:{lines:[{title:'<b>Harness</b>',productVariantId:variant,quantity:2,unitAmountMinor:12500,lineAmountMinor:25000}],subtotalMinor:25000},shipping:null,taxMinor:null,totalMinor:null,blockers:['Shipping service is not configured.']};})},
    '../buyer/saved-cart-client.js':{requestSavedCart:read??(async()=>({profileId:id,items:[{listing_id:id,product_variant_id:variant,quantity:2}]}))},
    './checkout-quote.js':{normalizeQuoteLines},
    '../supabase/browser':{createSupabaseBrowserClient:()=>({auth:{onAuthStateChange(fn){auth=fn;return{data:{subscription:{unsubscribe(){}}}};}}})},
  };
  new Function('require','exports','document','window','FormData','localStorage',compile(fs.readFileSync(new URL('../src/lib/commerce/checkout-page.ts',import.meta.url),'utf8')))(name=>{assert.ok(name in modules);return modules[name];},{},{getElementById:name=>nodes.get(name),createElement:()=>new Node()},{addEventListener(name,fn){events[name]=fn;}},class{get(name){return fields[name]??null;}},{getItem:()=>JSON.stringify([{id,productVariantId:variant,quantity:2}])});
  return{form,button,status:nodes.get('checkout-details-status'),summary:nodes.get('checkout-details-summary'),calls,emit:event=>auth(event),events};
}
test('actual checkout form carries variant lines from browser and saved carts and renders unknown fees honestly',async()=>{
  for(const source of ['browser','account']){
    const ui=await checkout({source});await ui.form.events.submit({preventDefault(){}});
    assert.equal(ui.calls[0].lines[0].productVariantId,variant);assert.equal(ui.calls[0].deliveryAddress.postalCode,'400001');
    assert.ok(ui.summary.children.some(node=>node.textContent==='Shipping: Not calculated'));assert.ok(ui.summary.children.some(node=>node.textContent.includes('<b>Harness</b>')));
    assert.match(ui.status.textContent,/remain unavailable/);assert.equal(ui.button.disabled,false);
  }
});
test('checkout account changes and field edits suppress pending results and clear private form state',async()=>{
  let finish;const ui=await checkout({review:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=ui.form.events.submit({preventDefault(){}});ui.emit('SIGNED_OUT');finish({});await pending;
  assert.equal(ui.summary.children.length,0);assert.match(ui.status.textContent,/account changed/);
  ui.form.events.input();assert.match(ui.status.textContent,/Details changed/);
});
test('checkout refuses saved-cart readback from a different customer identity',async()=>{
  const ui=await checkout({source:'account',read:async()=>({profileId:variant,items:[{listing_id:id,quantity:1,product_variant_id:null}]})});
  await ui.form.events.submit({preventDefault(){}});assert.match(ui.status.textContent,/account changed/);assert.equal(ui.summary.children.length,0);
});
