import test from 'node:test';
import assert from 'node:assert/strict';
import { startAddressBrowser } from './address-browser-helper.mjs';
import { createInventoryHandler } from '../src/lib/seller/inventory-api.js';
import { createCheckoutHandler } from '../src/lib/commerce/checkout-api.js';
import { loadProductOptions } from '../src/lib/commerce/product-selection.js';
const origin='http://127.0.0.1:4321',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('isolated desktop/mobile Chromium: seller inventory readback, account isolation, saved-cart quantity and stock-aware checkout review',{skip:process.env.VETIT_INVENTORY_BROWSER_TESTS!=='1'},async()=>{
  const browser=await startAddressBrowser();let actor=id(1),onHand=8,quantity=3,updatedAt='2026-11-10T12:00:00.000000+00:00';const calls=[];
  const inventory=()=>({businesses:[{id:id(2),name:'Synthetic Seller'}],variants:[{variantId:id(3),listingId:id(4),businessId:id(2),inventoryId:id(5),title:'Synthetic harness',sku:'HARNESS-M',attributes:{size:'M',colour:'Blue'},quantityOnHand:onHand,quantityReserved:2,updatedAt}]});
  const handler=createInventoryHandler({authenticate:async()=>({state:'authenticated',user:{id:actor},supabase:{rpc:async(name,args)=>{
    if(actor!==id(1))return{data:{businesses:[],variants:[]}};
    if(name==='get_my_seller_inventory')return{data:inventory()};
    if(args.p_expected_updated_at!==updatedAt)return{error:{code:'40001'}};
    onHand=args.p_quantity_on_hand;updatedAt='2026-11-10T12:00:01.000000+00:00';return{data:id(5)};
  }}})});
  const product={id:id(4),title:'Synthetic harness',category:'Accessories',sellerName:'Synthetic Seller',currencyCode:'INR',priceMinor:10000,priceIsFrom:false};
  const products=()=>{
    const results=[{data:[{id:id(3),listing_id:id(4),option_attributes:{size:'M',colour:'Blue'}}],count:1},{data:[{listing_id:id(4),product_variant_id:id(3),amount_minor:10000}],count:1}];
    const client={rpc:async()=>({data:[{variant_id:id(3),max_quantity:onHand-2}]}),from(){const result=results.shift(),query={then:resolve=>Promise.resolve(result).then(resolve)};for(const name of ['select','in','eq','order','limit','lte','or'])query[name]=()=>query;return query;}};
    return loadProductOptions(client,[product]);
  };
  const review=createCheckoutHandler({authenticate:async()=>({state:'authenticated',user:{id:actor}}),dependencies:async()=>({loadProducts:products})});
  const navigate=async path=>{await browser.send('Page.navigate',{url:origin+path});};
  try{
    browser.on('Fetch.requestPaused',async({requestId,request})=>{
      const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
      if(url.pathname==='/src/lib/supabase/browser.ts'){
        const source=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}}};window.__inventoryIdentity=()=>{for(const fn of listeners)fn('SIGNED_IN',null)};`;
        return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});
      }
      if(!url.pathname.startsWith('/api/'))return browser.send('Fetch.continueRequest',{requestId});
      calls.push({path:url.pathname,method:request.method});
      const req=new Request(request.url,{method:request.method,headers:request.headers,...(!['GET','HEAD'].includes(request.method)?{body:request.postData??''}:{})});let response;
      if(url.pathname==='/api/seller/stock')response=await handler({request:req});
      else if(url.pathname==='/api/buyer/cart'){
        if(request.method==='POST'){quantity=JSON.parse(request.postData).quantity;response=Response.json({apiVersion:1,state:'saved',cartItemId:id(6)});}
        else response=Response.json({apiVersion:1,state:'available',profileId:actor,marketCode:'IN',cart:{id:id(7),market_code:'IN',currency_code:'INR',status:'active'},items:[{id:id(6),listing_id:id(4),product_variant_id:id(3),quantity,title:product.title}]});
      }else if(url.pathname==='/api/checkout/review')response=await review({request:req});
      else response=Response.json({state:'unavailable'},{status:503});
      await browser.send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
    });
    await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await navigate('/seller/inventory?lang=hi');await browser.wait(`document.querySelector('#inventory-content input')?.disabled===false`);
    assert.equal(await browser.evaluate('document.documentElement.lang'),'en');
    await browser.evaluate(`(()=>{const n=document.querySelector('#inventory-content input');n.value='4';n.dispatchEvent(new Event('input',{bubbles:true}));n.closest('form').requestSubmit();})()`);
    await browser.wait(`document.getElementById('inventory-status')?.textContent==='Inventory updated and checked.'`);assert.equal(onHand,4);
    assert.match(await browser.evaluate(`document.querySelector('#inventory-content dl').textContent`),/On hand4Reserved2Available to order2/);
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true,'Inventory must fit a mobile viewport');
    actor=id(9);await browser.evaluate('window.__inventoryIdentity()');await browser.wait(`document.querySelector('#inventory-content').children.length===0`);
    assert.equal(await browser.evaluate(`document.getElementById('inventory-signin').hidden`),false);
    const checkout=async()=>{
      await navigate('/checkout?source=account');await browser.wait(`document.readyState==='complete'&&document.querySelector('#checkout-details')!==null`);
      await browser.evaluate(`(()=>{const f=document.getElementById('checkout-details');const values={recipientName:'Synthetic Customer',email:'synthetic@example.invalid',phone:'9876543210',addressLine1:'1 Synthetic Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'};for(const [k,v] of Object.entries(values)){const n=f.elements.namedItem(k);if(n)n.value=v;}f.requestSubmit();})()`);
    };
    await checkout();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('stock')`);
    await navigate('/account/cart');await browser.wait(`document.querySelector('#saved-items input')?.disabled===false`);
    await browser.evaluate(`(()=>{const n=document.querySelector('#saved-items input');n.value='2';n.closest('form').requestSubmit();})()`);
    await browser.wait(`document.getElementById('saved-status').textContent.includes('updated')`);assert.equal(quantity,2);
    await checkout();await browser.wait(`document.getElementById('checkout-details-status').textContent.includes('Review complete')`);
    assert.match(await browser.evaluate(`document.getElementById('checkout-details-summary').textContent`),/Synthetic harness/);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
    assert.equal(calls.filter(c=>c.path==='/api/seller/stock'&&c.method==='POST').length,1);
    assert.equal(calls.some(c=>c.path==='/api/checkout/orders'),false);assert.deepEqual(browser.errors,[]);
  }catch(error){console.error('Browser diagnostic',await browser.evaluate(`JSON.stringify({url:location.href,status:document.querySelector('[role=status]')?.textContent,checkout:document.getElementById('checkout-details-status')?.textContent})`),browser.errors);throw error;}finally{await browser.close();}
});
