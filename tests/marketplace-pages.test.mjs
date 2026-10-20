import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createOrderWorkspace} from '../src/lib/buyer/order-workspace.js';
import {requestBuyerOrders} from '../src/lib/buyer/orders-client.js';
import {workspaceCopy,orderStatusLabel,formatWorkspaceMoney} from '../src/lib/marketplace/workspace-copy.js';
import {requestCheckoutQuote,QuoteClientError} from '../src/lib/commerce/quote-client.js';
import {normalizeQuoteLines} from '../src/lib/commerce/checkout-quote.js';
const id='10000000-0000-4000-8000-000000000001';
const order={id,market_code:'IN',order_status:'processing',currency_code:'INR',subtotal_minor:12550,delivery_minor:0,tax_minor:0,total_minor:12550,created_at:'2026-10-18T10:00:00Z'};
class Element {
  constructor(tag='div') {this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.attributes={};this.text='';}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  set innerHTML(_){throw Error('Unsafe HTML rendering attempted');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=children;}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
  async emit(name,event={}){for(const callback of this.listeners[name]??[])await callback(event);}
}
async function mount(file,dependencies,query='',saved='[]') {
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const elements=new Map();
  for(const match of source.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*\bid="([^"]+)"[^<>]*)>/g)){
    const element=new Element(match[1]);element.hidden=/\bhidden\b/.test(match[2]);element.disabled=/\bdisabled\b/.test(match[2]);elements.set(match[3],element);
  }
  const document={documentElement:{lang:'en'},getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)};
  const events={};const url=new URL('http://localhost:4321/'+file.split('/').at(-1).replace('.astro','')+query);
  const location={href:url.href,origin:url.origin,pathname:url.pathname,search:url.search};
  const window={addEventListener(name,callback){events[name]=callback;}};
  const script=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n').replace(/^\s*import[^\n]+$/gm,'');
  const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export\s*\{\s*\};?\s*$/gm,'');
  vm.runInNewContext(code,{document,window,location,history:{replaceState(_state,_title,url){location.href=url.href;location.search=url.search;}},localStorage:{getItem(){return saved;}},URL,URLSearchParams,AbortController,Intl,Date,console,...dependencies},{filename:file});
  const flush=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};
  await flush();
  return {elements,document,events,flush};
}
function orderDependencies(fetchImpl){return{createOrderWorkspace:options=>createOrderWorkspace({...options,read:input=>requestBuyerOrders({...input,baseUrl:'http://localhost:4321',fetchImpl})}),workspaceCopy,orderStatusLabel,formatWorkspaceMoney};}
test('actual order-page script renders list, switches language without refetch and builds safe detail links',async()=>{
  let calls=0;
  const page=await mount('src/pages/orders.astro',orderDependencies(async()=>{calls++;return new Response(JSON.stringify({apiVersion:1,state:'available',orders:[order],nextCursor:null}));}));
  assert.match(page.elements.get('orders-content').textContent,/125\.50/);
  const link=page.elements.get('orders-content').children[0].children.at(-1);assert.equal(new URL(link.href,'http://localhost').pathname,'/orders');
  page.elements.get('orders-language').value='hi';await page.elements.get('orders-language').emit('change');
  assert.equal(page.document.documentElement.lang,'hi');assert.equal(page.elements.get('orders-title').textContent,'आपके ऑर्डर');assert.equal(calls,1);
});
test('actual order detail renders untrusted titles and tracking as text only',async()=>{
  const detail={apiVersion:1,state:'available',order,items:[{id,listing_id:id,business_id:id,product_variant_id:null,title_snapshot:'<script>SYNTHETIC</script>',quantity:1,unit_price_minor:12550,currency_code:'INR'}],fulfilments:[{id,business_id:id,status:'shipped',carrier:'Synthetic carrier',tracking_reference:'javascript:synthetic',shipped_at:'2026-10-18T11:00:00Z',delivered_at:null}],truncated:true};
  const page=await mount('src/pages/orders.astro',orderDependencies(async()=>new Response(JSON.stringify(detail))),'?orderId='+id);
  const content=page.elements.get('orders-content');assert.match(content.textContent,/<script>SYNTHETIC<\/script>/);assert.match(content.textContent,/javascript:synthetic/);assert.match(content.textContent,/more records/);
  const walk=node=>[node,...node.children.flatMap(walk)];assert.equal(walk(content).some(node=>node.tagName==='SCRIPT'||node.tagName==='A'),false);
});
test('actual order page distinguishes empty, sign-in, not-found and unavailable UI',async()=>{
  for(const [status,message,signin] of [[200,'No orders yet.',false],[401,'Sign in',true],[404,'Order not found',false],[503,'temporarily unavailable',false]]){
    const page=await mount('src/pages/orders.astro',orderDependencies(async()=>new Response(status===200?JSON.stringify({apiVersion:1,state:'available',orders:[],nextCursor:null}):'SYNTHETIC_PRIVATE',{status})));
    assert.ok(page.elements.get('orders-status').textContent.includes(message));assert.equal(page.elements.get('orders-signin').hidden,!signin);assert.equal(page.elements.get('orders-content').textContent.includes('SYNTHETIC_PRIVATE'),false);
  }
});
function quoteDependencies(fetchImpl){return{requestCheckoutQuote:(lines,options)=>requestCheckoutQuote(lines,{...options,baseUrl:'http://localhost:4321',fetchImpl}),QuoteClientError,normalizeQuoteLines,formatWorkspaceMoney};}
test('actual checkout page makes no request for an empty browser cart',async()=>{
  let calls=0;const page=await mount('src/pages/checkout.astro',quoteDependencies(async()=>{calls++;throw Error();}));
  await page.elements.get('quote-refresh').emit('click');assert.equal(calls,0);assert.match(page.elements.get('quote-status').textContent,/empty/);assert.equal(page.elements.get('quote-payment').disabled,true);
});
test('actual checkout renders current server prices, keeps payment disabled and invalidates changed cart',async()=>{
  const body={apiVersion:1,state:'quote_only',marketCode:'IN',currencyCode:'INR',checkoutEnabled:false,deliveryMinor:null,feesMinor:null,totalMinor:null,subtotalMinor:12550,lines:[{listingId:id,quantity:1,title:'<b>synthetic</b>',category:'Food',sellerName:'Seller',unitAmountMinor:12550,lineAmountMinor:12550,currencyCode:'INR'}]};
  const page=await mount('src/pages/checkout.astro',quoteDependencies(async()=>new Response(JSON.stringify(body))),'',JSON.stringify([{id,quantity:1,pricePaise:1}]));
  await page.elements.get('quote-refresh').emit('click');assert.match(page.elements.get('quote-subtotal').textContent,/125\.50/);assert.match(page.elements.get('quote-lines').textContent,/<b>synthetic<\/b>/);assert.equal(page.elements.get('quote-payment').disabled,true);
  page.events.storage({key:'vetit-cart-v1'});assert.equal(page.elements.get('quote-subtotal').textContent,'');assert.match(page.elements.get('quote-status').textContent,/cart changed/);
});
test('actual checkout exposes sign-in state without raw server error disclosure',async()=>{
  const page=await mount('src/pages/checkout.astro',quoteDependencies(async()=>new Response('SYNTHETIC_PRIVATE',{status:401})),'',JSON.stringify([{id,quantity:1}]));
  await page.elements.get('quote-refresh').emit('click');assert.equal(page.elements.get('quote-signin').hidden,false);assert.equal(page.elements.get('quote-refresh').disabled,false);assert.equal(page.elements.get('quote-status').textContent.includes('SYNTHETIC_PRIVATE'),false);
});
