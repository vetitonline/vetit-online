import test from 'node:test';
import assert from 'node:assert/strict';
import {startAddressBrowser} from './address-browser-helper.mjs';
import {createBuyerOrderHistoryHandler} from '../src/lib/buyer/order-history.js';
import {createBuyerOrderCancelHandler} from '../src/lib/buyer/order-cancel-api.js';
const origin='http://127.0.0.1:4321',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('desktop/mobile Chromium: confirmed customer cancellation, readback, paid-order race and account isolation',{skip:process.env.VETIT_CANCEL_BROWSER_TESTS!=='1'},async()=>{
  const browser=await startAddressBrowser();let actor=id(1),writes=0;
  const order=n=>({id:id(n),customer_profile_id:id(1),market_code:'IN',order_status:'pending',currency_code:'INR',subtotal_minor:10000,delivery_minor:500,tax_minor:100,total_minor:10600,created_at:'2026-11-10T12:00:00Z'});
  const rows=[order(2),order(3)];
  const authenticate=async()=>({state:'authenticated',user:{id:actor},supabase:{
    from(table){let single=false,limit=20;const filters=new Map(),q={select:()=>q,eq:(key,value)=>{filters.set(key,value);return q;},order:()=>q,limit:value=>{limit=value;return q;},maybeSingle:()=>{single=true;return q;},then(resolve,reject){
      let data;if(table==='orders')data=rows.filter(r=>r.customer_profile_id===actor&&[...filters].every(([key,value])=>r[key]===value)).slice(0,limit);
      else if(table==='order_items')data=[{id:id(5),listing_id:id(6),business_id:id(7),product_variant_id:id(8),title_snapshot:'<script>Synthetic private harness</script>',quantity:1,unit_price_minor:10000,currency_code:'INR'}];
      else if(table==='fulfilments')data=[{id:id(9),business_id:id(7),status:rows.find(r=>r.id===filters.get('order_id')).order_status==='cancelled'?'cancelled':'pending',carrier:null,tracking_reference:null,shipped_at:null,delivered_at:null}];
      return Promise.resolve({data:single?data[0]??null:data}).then(resolve,reject);
    }};return q;},
    rpc:async(name,args)=>{assert.equal(name,'cancel_my_checkout_order');writes++;const row=rows.find(r=>r.id===args.p_order_id);if(row.id===id(3)){row.order_status='confirmed';return{error:{code:'42501'}};}row.order_status='cancelled';return{data:row};}
  }});
  const history=createBuyerOrderHistoryHandler({authenticate}),cancel=createBuyerOrderCancelHandler({authenticate});
  try{
    browser.on('Fetch.requestPaused',async({requestId,request})=>{
      const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
      if(url.pathname==='/src/lib/supabase/browser.ts'){
        const source=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}}};window.__orderIdentity=()=>{for(const fn of listeners)fn('SIGNED_IN',null)};`;
        return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});
      }
      if(!url.pathname.startsWith('/api/'))return browser.send('Fetch.continueRequest',{requestId});
      const req=new Request(request.url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:request.postData}:{})});
      const response=url.pathname==='/api/buyer/orders'?await history({request:req,url}):url.pathname==='/api/buyer/orders/cancel'?await cancel({request:req}):Response.json({state:'unavailable'},{status:503});
      await browser.send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
    });
    await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await browser.send('Page.navigate',{url:origin+'/orders?orderId='+id(2)});await browser.wait(`document.getElementById('orders-cancel')!==null`);
    await browser.evaluate(`window.__nativeConfirm=window.confirm;window.confirm=()=>false;document.getElementById('orders-cancel').click()`);assert.equal(writes,0);
    await browser.evaluate(`window.confirm=window.__nativeConfirm;document.getElementById('orders-cancel').click()`);
    await browser.wait(`document.getElementById('orders-status').textContent.includes('cancellation confirmed')`);assert.equal(writes,1);assert.equal(rows[0].order_status,'cancelled');
    assert.equal(await browser.evaluate(`document.getElementById('orders-cancel')===null`),true);
    assert.match(await browser.evaluate(`document.getElementById('orders-content').textContent`),/<script>Synthetic private harness<\/script>/);
    assert.equal(await browser.evaluate(`document.querySelector('#orders-content script')===null`),true);
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
    await browser.send('Page.navigate',{url:origin+'/orders?orderId='+id(3)+'&lang=ta'});await browser.wait(`document.getElementById('orders-cancel')!==null`);
    assert.equal(await browser.evaluate('document.documentElement.lang'),'en');
    await browser.evaluate(`document.getElementById('orders-cancel').click()`);await browser.wait(`document.getElementById('orders-status').textContent.includes('unconfirmed')`);
    assert.equal(await browser.evaluate(`document.getElementById('orders-content').children.length`),0);assert.equal(writes,2);
    await browser.evaluate(`document.getElementById('orders-retry').click()`);await browser.wait(`document.getElementById('orders-content').textContent.includes('Confirmed')`);
    assert.equal(await browser.evaluate(`document.getElementById('orders-cancel')===null`),true);assert.equal(writes,2);
    actor=id(10);await browser.evaluate('window.__orderIdentity()');await browser.wait(`document.getElementById('orders-content').children.length===0`);
    await browser.evaluate(`document.getElementById('orders-retry').click()`);await browser.wait(`document.getElementById('orders-status').textContent.includes('not found')`);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);assert.deepEqual(browser.errors,[]);
  }catch(error){console.error('Browser diagnostic',await browser.evaluate(`JSON.stringify({url:location.href,status:document.getElementById('orders-status')?.textContent,content:document.getElementById('orders-content')?.textContent})`),browser.errors);throw error;}finally{await browser.close();}
});
