import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createCartPriceReview} from '../src/lib/buyer/cart-price-review.js';
import {groupSellerOrders,normalizeSellerOrders} from '../src/lib/seller/order-groups.js';
import {requestCheckoutQuote} from '../src/lib/commerce/quote-client.js';
import * as security from '../src/lib/api/request-security.js';
import * as quoteMath from '../src/lib/commerce/checkout-quote.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cart=(quantity=2,owner=id(1))=>({apiVersion:1,state:'available',profileId:owner,marketCode:'IN',cart:{id:id(2),market_code:'IN',currency_code:'INR',status:'active'},items:[{id:id(3),listing_id:id(4),product_variant_id:id(5),quantity,title:'Stored title'}]});
const price={apiVersion:1,state:'quote_only',marketCode:'IN',currencyCode:'INR',checkoutEnabled:false,subtotalMinor:10000,deliveryMinor:null,feesMinor:null,totalMinor:null,lines:[{listingId:id(4),productVariantId:id(5),quantity:2,title:'Current product',category:'Feed',sellerName:'Seller',unitAmountMinor:5000,lineAmountMinor:10000,currencyCode:'INR'}]};
test('cart price review reads twice, binds account and quotes only saved selections without any mutation',async()=>{
 let state,reads=0,quotes=0;const host=createCartPriceReview({render:value=>state=value,read:async input=>{assert.equal(input.command,undefined);reads++;return cart();},quote:async(lines,options)=>{quotes++;assert.equal(options.profileId,id(1));assert.deepEqual(lines,[{listingId:id(4),productVariantId:id(5),quantity:2}]);return price;}});
 host.setCart(cart());assert.equal(reads,0);assert.equal(state.enabled,true);await host.review();assert.equal(reads,2);assert.equal(quotes,1);assert.equal(state.quote.subtotalMinor,10000);assert.equal(state.quote.totalMinor,null);assert.match(state.message,/Stock is not fully confirmed/);
 host.setCart(cart(3));assert.equal(state.quote,null);assert.equal(state.phase,'idle');
});
test('changed saved cart or account is rejected before quoting or before displaying a result',async()=>{
 for(const late of [false,true]){let state,reads=0,quotes=0;const host=createCartPriceReview({render:value=>state=value,read:async()=>++reads===(late?2:1)?cart(3):cart(),quote:async()=>{quotes++;return price;}});host.setCart(cart());await host.review();assert.equal(state.phase,'error');assert.equal(state.quote,null);assert.equal(quotes,late?1:0);}
 let state;const host=createCartPriceReview({render:value=>state=value,read:async()=>cart(2,id(9)),quote:async()=>{throw Error('Must not quote wrong account');}});host.setCart(cart());await host.review();assert.match(state.message,/account or saved cart changed/);
});
test('cart invalidation and disposal discard late quotes and repeated review taps are coalesced',async()=>{
 for(const dispose of [false,true]){let state,resolve,calls=0;const host=createCartPriceReview({render:value=>state=value,read:async()=>cart(),quote:async()=>{calls++;return new Promise(done=>resolve=done);}});host.setCart(cart());const pending=host.review();for(let i=0;i<10;i++)await Promise.resolve();await host.review();assert.equal(calls,1);dispose?host.dispose():host.setCart(null);resolve(price);await pending;if(!dispose)assert.equal(state.quote,null);assert.notEqual(state.phase,'ready');}
});
test('empty and excessive carts cannot silently quote a truncated set of selections',async()=>{
 let state,calls=0;const host=createCartPriceReview({render:value=>state=value,quote:async()=>{calls++;}});
 host.setCart({...cart(),items:[]});await host.review();assert.equal(state.enabled,false);
 host.setCart({...cart(),items:Array.from({length:51},(_,i)=>({...cart().items[0],id:id(100+i),listing_id:id(200+i)}))});await host.review();assert.equal(state.enabled,false);assert.match(state.message,/50 saved selections/);assert.equal(calls,0);
});
test('stock/price failures clear old subtotals, remain actionable and never expose raw service diagnostics',async()=>{
 let state;const host=createCartPriceReview({render:value=>state=value,read:async()=>cart(),quote:async()=>{throw Object.assign(Error('PRIVATE'),{status:422});}});host.setCart(cart());await host.review();assert.equal(state.quote,null);assert.match(state.message,/quantities and availability/);assert.doesNotMatch(state.message,/PRIVATE/);
});
const item=(n,business=id(8),order=id(7))=>({id:id(n),business_id:business,orderId:order,listing_id:id(4),product_variant_id:id(5),title_snapshot:'Harness',quantity:2,unit_price_minor:5000,currency_code:'INR'});
const shipment=(n,business=id(8),order=id(7))=>({id:id(n),business_id:business,orderId:order,status:'packed',carrier:null,tracking_reference:null,shipped_at:null,delivered_at:null});
const snapshot={apiVersion:1,state:'available',profileId:id(1),items:[item(10),item(11,id(9))],fulfilments:[shipment(12),shipment(13,id(9))]};
test('seller grouping keeps businesses separate within the same order and calculates only each business item subtotal',()=>{
 const groups=groupSellerOrders(snapshot);assert.equal(groups.length,2);assert.equal(groups[0].subtotalMinor,10000);assert.equal(groups[0].items.length,1);assert.equal(groups[0].fulfilments.length,1);assert.notEqual(groups[0].key,groups[1].key);
 assert.equal(groupSellerOrders({...snapshot,items:[]})[0].subtotalMinor,null);
 assert.equal(groupSellerOrders(snapshot,{query:'harness',status:'packed'}).length,2);assert.equal(groupSellerOrders(snapshot,{query:'foreign'}).length,0);assert.equal(groupSellerOrders(snapshot,{status:'delivered'}).length,0);
});
test('seller response projection strips unrelated private fields and rejects malformed identities, duplicates, currency errors or overflow',()=>{
 const normalized=normalizeSellerOrders({...snapshot,items:[{...item(10),private:'SECRET'}],customer:'SECRET'});assert.doesNotMatch(JSON.stringify(normalized),/SECRET/);
 for(const input of [{...snapshot,profileId:'bad'},{...snapshot,items:[item(10),item(10)]},{...snapshot,items:[{...item(10),currency_code:'invalid'}]}])assert.throws(()=>normalizeSellerOrders(input));
 assert.throws(()=>groupSellerOrders({...snapshot,items:[item(10),{...item(11),currency_code:'USD'}]}));
 assert.throws(()=>groupSellerOrders({...snapshot,items:[{...item(10),unit_price_minor:Number.MAX_SAFE_INTEGER}]}));
});
test('shared quote transport sends the expected account and rejects a mismatched or missing verified response identity',async()=>{
 for(const owner of [id(1),id(9),undefined]){
  const invoke=()=>requestCheckoutQuote([{listingId:id(4),productVariantId:id(5),quantity:2}],{baseUrl:'https://vetit.invalid',profileId:id(1),fetchImpl:async(_url,options)=>{assert.equal(options.headers['x-vetit-profile-id'],id(1));return Response.json({...price,profileId:owner});}});
  if(owner===id(1))assert.equal((await invoke()).subtotalMinor,10000);else await assert.rejects(invoke);
 }
});
test('actual quote route blocks a changed account before loading public products and returns verified identity for fresh requests',async()=>{
 let products=0;const modules={'../../../lib/api/request-security.js':security,'../../../lib/commerce/checkout-quote.js':quoteMath,'../../../lib/supabase/api-auth':{authenticateApiRequest:async()=>({state:'authenticated',user:{id:id(1)},supabase:{}})},'../../../lib/marketplace/featured-products':{getMarketplaceProducts:async()=>{products++;return{state:'available',products:[]};}},'../../../lib/commerce/product-selection.js':{loadProductOptions:async()=>[{id:id(4),title:'Current',category:'Feed',sellerName:'Seller',currencyCode:'INR',priceMinor:5000,priceIsFrom:false,options:[{variantId:id(5),priceMinor:5000,stockQuantity:2}]}]}};
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/pages/api/checkout/quote.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,exports={};new Function('require','exports',code)(key=>{assert.ok(key in modules,key);return modules[key];},exports);
 const send=owner=>exports.POST({request:new Request('https://vetit.invalid/api/checkout/quote',{method:'POST',headers:{'content-type':'application/json','x-vetit-profile-id':owner},body:JSON.stringify({lines:[{listingId:id(4),productVariantId:id(5),quantity:2}]})})});
 assert.equal((await send(id(9))).status,409);assert.equal(products,0);const fresh=await send(id(1));assert.equal(fresh.status,200);assert.equal((await fresh.json()).profileId,id(1));
});
