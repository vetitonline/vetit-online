import test from 'node:test';
import assert from 'node:assert/strict';
import {startAddressBrowser} from './address-browser-helper.mjs';
import {createCheckoutHandler} from '../src/lib/commerce/checkout-api.js';
import {normalizeQuoteLines,calculateCheckoutQuote} from '../src/lib/commerce/checkout-quote.js';
const origin='http://127.0.0.1:4321',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('desktop/mobile Chromium: selected cart, authoritative prices/stock, stale cart guards and unavailable browser storage',{skip:process.env.VETIT_CHECKOUT_CART_BROWSER_TESTS!=='1'},async()=>{
 const browser=await startAddressBrowser();let owner=id(1),quantity=2,quoteMode='normal',reviewMode='normal',unauthorized=false;const calls=[];
 const products=[{id:id(4),title:'Current account harness',category:'Accessories',sellerName:'Synthetic Seller',currencyCode:'INR',priceMinor:12500,priceIsFrom:false,options:[{variantId:id(5),priceMinor:12500,stockQuantity:3}]},{id:id(9),title:'Current browser feed',category:'Food',sellerName:'Synthetic Seller',currencyCode:'INR',priceMinor:20000,priceIsFrom:false,options:[{variantId:null,priceMinor:20000,stockQuantity:3}]}];
 const review=createCheckoutHandler({authenticate:async()=>({state:'authenticated',user:{id:owner}}),dependencies:async()=>({loadProducts:async()=>products})});
 const browserCart=qty=>JSON.stringify([{id:id(9),quantity:qty,pricePaise:1,title:'Outdated browser price'}]);
 try{
  browser.on('Fetch.requestPaused',async({requestId,request})=>{
   const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
   if(url.pathname==='/src/lib/supabase/browser.ts'){
    const source=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}},async getUser(){return{data:{user:{id:'${id(1)}'}},error:null}}}}};`;
    return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});
   }
   if(!url.pathname.startsWith('/api/'))return browser.send('Fetch.continueRequest',{requestId});calls.push({path:url.pathname,method:request.method,body:request.postData?JSON.parse(request.postData):null});let response;
   if(url.pathname==='/api/buyer/cart')response=unauthorized?Response.json({state:'unauthorized'},{status:401}):Response.json({apiVersion:1,state:'available',profileId:owner,marketCode:'IN',cart:owner===id(1)?{id:id(2),market_code:'IN',currency_code:'INR',status:'active'}:null,items:owner===id(1)?[{id:id(3),listing_id:id(4),product_variant_id:id(5),quantity,title:'Outdated account title'}]:[]});
   else if(url.pathname==='/api/checkout/quote'){
    try{const quote=calculateCheckoutQuote(normalizeQuoteLines(JSON.parse(request.postData)),products);response=Response.json({...quote,apiVersion:1,profileId:owner,stockState:'known'});}catch{response=Response.json({state:'quote_unavailable'},{status:422});}
    if(quoteMode==='browser_changed'){quoteMode='normal';await browser.evaluate(`localStorage.setItem('vetit-cart-v1',${JSON.stringify(browserCart(2))})`);}
   }else if(url.pathname==='/api/checkout/review'){
    response=await review({request:new Request(request.url,{method:'POST',headers:request.headers,body:request.postData})});
    if(reviewMode==='cart_changed'){quantity=3;reviewMode='normal';}
    if(reviewMode==='account_changed'){owner=id(10);reviewMode='normal';}
   }else response=Response.json({state:'unavailable'},{status:503});
   await browser.send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:origin+'/checkout?source=account'});await browser.wait(`document.readyState==='complete'&&document.querySelector('#checkout-details [name=source]')?.value==='account'`);
  await browser.evaluate(`localStorage.setItem('vetit-cart-v1',${JSON.stringify(browserCart(1))});document.getElementById('quote-refresh').click()`);await browser.wait(`document.getElementById('quote-subtotal').textContent.includes('250.00')`);
  assert.equal(calls.find(c=>c.path==='/api/checkout/quote').body.lines[0].listingId,id(4));assert.match(await browser.evaluate(`document.getElementById('quote-lines').textContent`),/Current account harness/);
  await browser.evaluate(`(()=>{const n=document.querySelector('[name=source]');n.value='browser';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);assert.equal(await browser.evaluate(`document.getElementById('quote-lines').children.length`),0);
  quoteMode='browser_changed';await browser.evaluate(`document.getElementById('quote-refresh').click()`);await browser.wait(`document.getElementById('quote-status').textContent.includes('cart changed during review')`);assert.equal(await browser.evaluate(`document.getElementById('quote-subtotal').textContent`),'');
  await browser.evaluate(`document.getElementById('quote-refresh').click()`);await browser.wait(`document.getElementById('quote-subtotal').textContent.includes('400.00')`);
  const quoteCount=calls.filter(c=>c.path==='/api/checkout/quote').length;
  await browser.evaluate(`window.__cartGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='vetit-cart-v1')throw new DOMException('Synthetic storage blocked','SecurityError');return window.__cartGetItem.call(this,key)};document.getElementById('quote-refresh').click()`);
  await browser.wait(`document.getElementById('quote-status').textContent.includes('Browser storage is unavailable')`);assert.equal(calls.filter(c=>c.path==='/api/checkout/quote').length,quoteCount);
  await browser.evaluate(`(()=>{const n=document.querySelector('[name=source]');n.value='account';n.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('quote-refresh').click();})()`);await browser.wait(`document.getElementById('quote-subtotal').textContent.includes('250.00')`);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
  const fill=()=>browser.evaluate(`(()=>{const f=document.getElementById('checkout-details');const values={email:'synthetic@example.invalid',recipientName:'Synthetic Customer',phone:'9876543210',addressLine1:'1 Synthetic Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001'};for(const [key,value] of Object.entries(values))f.elements.namedItem(key).value=value;f.requestSubmit();})()`);
  reviewMode='cart_changed';await fill();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('cart changed during review')`);
  assert.equal(await browser.evaluate(`document.querySelector('[name=recipientName]').value`),'Synthetic Customer');assert.equal(await browser.evaluate(`document.getElementById('checkout-details-summary').children.length`),0);
  await fill();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('Review complete')`);assert.match(await browser.evaluate(`document.getElementById('checkout-details-summary').textContent`),/375\.00/);
  quantity=4;await fill();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('current stock')`);assert.equal(await browser.evaluate(`document.getElementById('checkout-details-summary').children.length`),0);
  quantity=2;reviewMode='account_changed';await fill();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('account changed')`);assert.equal(await browser.evaluate(`document.querySelector('[name=recipientName]').value`),'');assert.equal(await browser.evaluate(`document.getElementById('quote-lines').children.length`),0);
  owner=id(1);unauthorized=true;await browser.evaluate(`(()=>{const n=document.querySelector('[name=source]');n.value='account';n.dispatchEvent(new Event('change'));document.getElementById('quote-refresh').click();})()`);await browser.wait(`document.getElementById('quote-signin').hidden===false`);
  assert.ok(calls.every(c=>c.method==='GET'||['/api/checkout/quote','/api/checkout/review'].includes(c.path)));assert.equal(await browser.evaluate(`document.getElementById('quote-payment').disabled`),true);assert.deepEqual(browser.errors,[]);
 }catch(error){console.error('Browser diagnostic',await browser.evaluate(`JSON.stringify({quote:document.getElementById('quote-status')?.textContent,details:document.getElementById('checkout-details-status')?.textContent})`),browser.errors);throw error;}finally{await browser.close();}
});
