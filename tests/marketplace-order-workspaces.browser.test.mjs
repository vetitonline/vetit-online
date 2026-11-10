import test from 'node:test';
import assert from 'node:assert/strict';
import {startAddressBrowser} from './address-browser-helper.mjs';
import {calculateCheckoutQuote,normalizeQuoteLines} from '../src/lib/commerce/checkout-quote.js';
const origin='http://127.0.0.1:4321',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('isolated Chromium: saved-cart current prices/stock, grouped seller orders, filters and confirmed shipment readback on mobile/desktop',{skip:process.env.VETIT_ORDER_WORKSPACE_BROWSER_TESTS!=='1'},async()=>{
 const browser=await startAddressBrowser();let quantity=2,owner=id(1);const calls=[];
 const items=[8,9].map((business,n)=>({id:id(20+n),business_id:id(business),orderId:id(7),listing_id:id(4),product_variant_id:id(5),title_snapshot:n?'Synthetic feed':'Synthetic harness',quantity:2,unit_price_minor:5000,currency_code:'INR'}));
 const shipments=[8,9].map((business,n)=>({id:id(30+n),business_id:id(business),orderId:id(7),status:n?'shipped':'packed',carrier:n?'Synthetic Carrier':null,tracking_reference:n?'TRACK-EXISTING':null,shipped_at:n?'2026-11-10T12:00:00Z':null,delivered_at:null}));
 try{
  browser.on('Fetch.requestPaused',async({requestId,request})=>{
   const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
   if(url.pathname==='/src/lib/supabase/browser.ts'){
    const source=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}}};window.__workspaceIdentity=()=>{for(const fn of listeners)fn('SIGNED_IN',null)};`;
    return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});
   }
   if(!url.pathname.startsWith('/api/'))return browser.send('Fetch.continueRequest',{requestId});calls.push({path:url.pathname,method:request.method});let response;
   if(url.pathname==='/api/buyer/cart'){
    if(request.method==='POST'){quantity=JSON.parse(request.postData).quantity;response=Response.json({apiVersion:1,state:'saved',cartItemId:id(3)});}
    else response=Response.json({apiVersion:1,state:'available',profileId:owner,marketCode:'IN',cart:{id:id(2),market_code:'IN',currency_code:'INR',status:'active'},items:[{id:id(3),listing_id:id(4),product_variant_id:id(5),quantity,title:'Saved harness'}]});
   }else if(url.pathname==='/api/checkout/quote'){
    assert.equal(new Headers(request.headers).get('x-vetit-profile-id'),owner);
    try{const quote=calculateCheckoutQuote(normalizeQuoteLines(JSON.parse(request.postData)),[{id:id(4),title:'Current harness',category:'Accessories',sellerName:'Synthetic Seller',currencyCode:'INR',priceMinor:5000,priceIsFrom:false,options:[{variantId:id(5),priceMinor:5000,stockQuantity:3}]}]);response=Response.json({...quote,apiVersion:1,profileId:owner});}catch{response=Response.json({state:'quote_unavailable',code:'stock_unavailable'},{status:422});}
   }else if(url.pathname==='/api/seller/orders'){
    if(request.method==='POST'){assert.equal(new Headers(request.headers).get('x-vetit-profile-id'),owner);const change=JSON.parse(request.postData),row=shipments.find(s=>s.id===change.fulfilmentId);assert.equal(change.nextStatus,'shipped');assert.equal(change.carrier,'Synthetic New Carrier');row.status='shipped';row.carrier=change.carrier;row.tracking_reference=change.trackingReference;row.shipped_at='2026-11-10T13:00:00Z';response=Response.json({apiVersion:1,state:'updated',fulfilmentId:row.id});}
    else if(url.searchParams.has('fulfilmentId'))response=Response.json({apiVersion:1,state:'available',profileId:owner,scope:'a'.repeat(64),fulfilment:shipments.find(s=>s.id===url.searchParams.get('fulfilmentId'))});
    else response=Response.json({apiVersion:1,state:'available',profileId:owner,items,fulfilments:shipments,pagination:{scope:'a'.repeat(64),limit:50,nextCursor:null}});
   }else response=Response.json({state:'unavailable'},{status:503});
   await browser.send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:origin+'/account/cart'});await browser.wait(`document.getElementById('saved-review')?.disabled===false`);
  await browser.evaluate(`document.getElementById('saved-review').click()`);await browser.wait(`document.getElementById('saved-review-subtotal').textContent.includes('100.00')`);
  assert.match(await browser.evaluate(`document.getElementById('saved-review-lines').textContent`),/Current harness/);
  await browser.evaluate(`(()=>{const n=document.querySelector('#saved-items input');n.value='4';n.closest('form').requestSubmit();})()`);
  await browser.wait(`document.getElementById('saved-status').textContent.includes('updated')`);assert.equal(await browser.evaluate(`document.getElementById('saved-review-subtotal').textContent`),'');
  await browser.evaluate(`document.getElementById('saved-review').click()`);await browser.wait(`document.getElementById('saved-review-status').textContent.includes('availability')`);
  assert.equal(await browser.evaluate(`document.getElementById('saved-review-subtotal').textContent`),'');
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
  owner=id(10);await browser.evaluate(`window.__workspaceIdentity()`);await browser.wait(`document.getElementById('saved-items').children.length===0`);assert.equal(await browser.evaluate(`document.getElementById('saved-review').disabled`),true);
  owner=id(1);await browser.send('Page.navigate',{url:origin+'/seller/orders'});await browser.wait(`document.querySelectorAll('#seller-orders-content>section').length===2`);
  assert.equal(await browser.evaluate(`[...document.querySelectorAll('#seller-orders-content>section')].every(n=>n.textContent.includes('100.00'))`),true);
  await browser.evaluate(`(()=>{const n=document.getElementById('seller-orders-filter');n.value='packed';n.dispatchEvent(new Event('change'));})()`);await browser.wait(`document.querySelectorAll('#seller-orders-content>section').length===1`);
  await browser.evaluate(`(()=>{const n=document.querySelector('#seller-orders-content input');n.value='Synthetic New Carrier';n.dispatchEvent(new Event('input',{bubbles:true}));window.__oldConfirm=window.confirm;window.confirm=()=>false;const f=document.getElementById('seller-orders-filter');f.value='all';f.dispatchEvent(new Event('change'));})()`);
  assert.equal(await browser.evaluate(`document.getElementById('seller-orders-filter').value`),'packed');assert.equal(await browser.evaluate(`document.querySelector('#seller-orders-content input').value`),'Synthetic New Carrier');
  await browser.evaluate(`window.confirm=window.__oldConfirm;(()=>{const f=document.querySelector('#seller-orders-content form');f.querySelector('select').value='shipped';f.querySelectorAll('input')[1].value='TRACK-NEW';f.requestSubmit();})()`);
  await browser.wait(`document.getElementById('seller-orders-status').textContent==='Shipment status updated.'`);assert.equal(shipments[0].status,'shipped');
  await browser.evaluate(`(()=>{const n=document.getElementById('seller-orders-filter');n.value='all';n.dispatchEvent(new Event('change'));})()`);await browser.wait(`document.querySelectorAll('#seller-orders-content>section').length===2`);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);assert.equal(calls.filter(c=>c.path==='/api/seller/orders'&&c.method==='POST').length,1);assert.equal(calls.some(c=>c.path==='/api/checkout/orders'),false);
  await browser.evaluate(`window.__workspaceIdentity()`);await browser.wait(`document.getElementById('seller-orders-content').children.length===0`);assert.deepEqual(browser.errors,[]);
 }catch(error){console.error('Browser diagnostic',await browser.evaluate(`JSON.stringify({url:location.href,review:document.getElementById('saved-review-status')?.textContent,seller:document.getElementById('seller-orders-status')?.textContent})`),browser.errors);throw error;}finally{await browser.close();}
});
