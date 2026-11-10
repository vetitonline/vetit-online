import test from 'node:test';
import assert from 'node:assert/strict';
import {startAddressBrowser} from './address-browser-helper.mjs';
import {paginationFixture,id} from './seller-order-pagination-fixture.mjs';
const origin='http://127.0.0.1:4321';
test('desktop/mobile Chromium loads 251 seller records per stream, tracks partial subtotals and manages a historical shipment',{skip:process.env.VETIT_SELLER_PAGINATION_BROWSER_TESTS!=='1'},async()=>{
 const browser=await startAddressBrowser(),f=paginationFixture();const requests=[];
 try{
  browser.on('Fetch.requestPaused',async({requestId,request})=>{
   const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
   if(url.pathname==='/src/lib/supabase/browser.ts'){
    const source=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}}};window.__sellerPaginationIdentity=()=>{for(const fn of listeners)fn('SIGNED_IN',null)};`;
    return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});
   }
   if(!url.pathname.startsWith('/api/'))return browser.send('Fetch.continueRequest',{requestId});
   requests.push(request.url);const response=url.pathname==='/api/seller/orders'?await f.fetchImpl(request.url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:request.postData}:{})}):Response.json({state:'unavailable'},{status:503});
   await browser.send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:origin+'/seller/orders'});await browser.wait(`document.getElementById('seller-orders-progress')?.textContent.startsWith('50 item lines')`);
  assert.match(await browser.evaluate(`document.getElementById('seller-orders-content').textContent`),/Loaded items subtotal/);
  for(const count of [100,150,200,250,251]){
   await browser.evaluate(`document.getElementById('seller-orders-more').click()`);await browser.wait(`document.getElementById('seller-orders-progress')?.textContent.startsWith('${count} item lines')`);
  }
  assert.equal(await browser.evaluate(`document.getElementById('seller-orders-more').hidden`),true);
  assert.match(await browser.evaluate(`document.getElementById('seller-orders-content').textContent`),/Items subtotal for this business: ₹251\.00/);
  assert.equal(await browser.evaluate(`document.querySelectorAll('#seller-orders-content form').length`),251);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
  await browser.evaluate(`(()=>{const form=[...document.querySelectorAll('#seller-orders-content form')].at(-1);form.querySelector('select').value='shipped';form.querySelectorAll('input')[0].value='Synthetic Historical Carrier';form.querySelectorAll('input')[1].value='TRACK-HISTORICAL';form.requestSubmit();})()`);
  await browser.wait(`document.getElementById('seller-orders-status').textContent==='Shipment status updated.'`);assert.equal(f.writes.length,1);assert.equal(f.writes[0].args.p_fulfilment_id,id(2000));assert.equal(f.tables.fulfilments[0].status,'shipped');
  assert.ok(requests.some(url=>new URL(url).searchParams.get('fulfilmentId')===id(2000)));
  assert.match(await browser.evaluate(`document.getElementById('seller-orders-progress').textContent`),/^251 item lines/);
  await browser.evaluate(`document.getElementById('seller-orders-reload').click()`);await browser.wait(`document.getElementById('seller-orders-progress')?.textContent.startsWith('50 item lines')`);
  f.tables.business_memberships[0].member_role='viewer';await browser.evaluate(`document.getElementById('seller-orders-more').click()`);
  await browser.wait(`document.getElementById('seller-orders-status').textContent.includes('seller access changed')`);assert.equal(await browser.evaluate(`document.getElementById('seller-orders-content').children.length`),0);
  assert.equal(await browser.evaluate(`document.getElementById('seller-orders-more').hidden`),true);
  f.tables.business_memberships[0].member_role='owner';await browser.evaluate(`document.getElementById('seller-orders-reload').click()`);await browser.wait(`document.getElementById('seller-orders-progress')?.textContent.startsWith('50 item lines')`);
  await browser.evaluate('window.__sellerPaginationIdentity()');await browser.wait(`document.getElementById('seller-orders-content').children.length===0`);assert.equal(await browser.evaluate(`document.getElementById('seller-orders-progress').textContent`),'');assert.deepEqual(browser.errors,[]);
 }catch(error){console.error('Browser diagnostic',await browser.evaluate(`JSON.stringify({status:document.getElementById('seller-orders-status')?.textContent,progress:document.getElementById('seller-orders-progress')?.textContent})`),browser.errors);throw error;}finally{await browser.close();}
});
