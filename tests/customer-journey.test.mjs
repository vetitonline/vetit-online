import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProductOptions,selectProductOption } from '../src/lib/commerce/product-selection.js';
import { requestProductOptions } from '../src/lib/commerce/options-client.js';
import { normalizeQuoteLines,calculateCheckoutQuote } from '../src/lib/commerce/checkout-quote.js';
import { requestCheckoutQuote } from '../src/lib/commerce/quote-client.js';
import { normalizeCheckout,reviewCheckout,createCheckoutOrder,transitionReturn } from '../src/lib/commerce/checkout-service.js';
import { createCheckoutHandler } from '../src/lib/commerce/checkout-api.js';
import { requestCheckoutReview } from '../src/lib/commerce/checkout-review-client.js';
import { createBuyerOrderHistoryHandler } from '../src/lib/buyer/order-history.js';

const owner='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002',variant='abcdefab-1234-4abc-8def-abcdefabcdef',other='10000000-0000-4000-8000-000000000003',key='10000000-0000-4000-8000-000000000004';
const option={variantId:variant,attributes:{size:'M',colour:'Blue'},label:'size: M · colour: Blue',priceMinor:12500,stockQuantity:3};
const product={id,title:'Pet harness',category:'Accessories',sellerName:'Seller',priceMinor:10000,priceIsFrom:false,currencyCode:'INR',options:[{...option,variantId:null,label:'Standard',priceMinor:10000},option]};
const input={expectedTotalMinor:31000,lines:[{listingId:id,productVariantId:variant,quantity:2}],customer:{email:' CUSTOMER@example.in '},deliveryAddress:{recipientName:'Asha',phone:'9876543210',addressLine1:'1 Example Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}};
const now=Date.parse('2026-11-06T12:00:00Z');
const deps={loadProducts:async()=>[product],shipping:{quote:async()=>({id:'test-shipping',currencyCode:'INR',amountMinor:5000,expiresAt:'2099-11-06T12:15:00Z'})},taxes:{quote:async()=>({currencyCode:'INR',amountMinor:1000})},now:()=>now};

test('option selection enforces option identity, current positive price, quantity and known stock',()=>{
  assert.equal(selectProductOption([option],variant.toUpperCase(),2).quantity,2);
  for(const [options,selected,qty] of [[[option],other,1],[[option],variant,4],[[option],variant,0],[[option],variant,1.5],[[{...option,priceMinor:0}],variant,1],[[{...option,stockQuantity:-1}],variant,1]])assert.throws(()=>selectProductOption(options,selected,qty));
  assert.equal(selectProductOption([{...option,stockQuantity:null}],variant,99).quantity,99);
});
test('option loader uses eligible parent IDs, active variants and current INR prices without opening private inventory',async()=>{
  const calls=[];
  const results=[{data:[{id:variant,listing_id:id,option_attributes:{size:'M',colour:'Blue'}},{id:other,listing_id:id,option_attributes:{unsupported:{nested:'value'}}}],count:2},{data:[{listing_id:id,product_variant_id:null,amount_minor:10000},{listing_id:id,product_variant_id:variant,amount_minor:12500},{listing_id:id,product_variant_id:variant,amount_minor:99999}],count:3}];
  const client={rpc:async()=>({data:null,error:{code:'PGRST202'}}),from(table){const call=[table];calls.push(call);const result=results.shift();const q={then:resolve=>Promise.resolve(result).then(resolve)};for(const method of ['select','in','eq','order','limit','lte','or'])q[method]=(...args)=>{call.push([method,...args]);return q;};return q;}};
  const [result]=await loadProductOptions(client,[product],'2026-11-06T12:00:00Z');
  assert.equal(result.options.length,2);assert.equal(result.options[1].priceMinor,12500);assert.deepEqual(result.options[1].attributes,{size:'M',colour:'Blue'});assert.equal(result.options[1].stockQuantity,null);
  assert.deepEqual(calls.map(call=>call[0]),['product_variants','listing_prices']);assert.ok(JSON.stringify(calls).includes('active_status'));assert.ok(JSON.stringify(calls).includes('valid_from'));
});
test('public option transport rejects malformed or foreign responses and preserves zero-stock display',async()=>{
  const body={apiVersion:1,state:'available',listingId:id,currencyCode:'INR',options:[{...option,stockQuantity:0}]};
  assert.equal((await requestProductOptions(id,{baseUrl:'https://test.invalid',fetchImpl:async(_url,settings)=>{assert.equal(settings.credentials,'omit');return Response.json(body);}}))[0].stockQuantity,0);
  for(const payload of [{...body,listingId:other},{...body,options:[{...option,priceMinor:-1}]},{...body,options:[option,option]}])await assert.rejects(requestProductOptions(id,{baseUrl:'https://test.invalid',fetchImpl:async()=>Response.json(payload)}));
  await assert.rejects(requestProductOptions(id,{baseUrl:'https://user:pass@test.invalid'}));
});
test('quotes aggregate UUID/option pairs independently and use only the selected server price',()=>{
  const lines=normalizeQuoteLines({lines:[{listingId:id,productVariantId:variant.toUpperCase(),quantity:1,unitAmountMinor:1},{listingId:id,productVariantId:variant,quantity:1},{listingId:id,quantity:1}]});
  assert.equal(lines.length,2);assert.equal(lines[0].quantity,2);
  const quote=calculateCheckoutQuote(lines,[product]);assert.equal(quote.subtotalMinor,35000);assert.equal(quote.lines[0].productVariantId,variant);
  assert.throws(()=>calculateCheckoutQuote([{listingId:id,productVariantId:other,quantity:1}],[product]));
  assert.throws(()=>calculateCheckoutQuote([{listingId:id,productVariantId:variant,quantity:4}],[product]),error=>error.code==='stock_unavailable');
  assert.throws(()=>normalizeQuoteLines({lines:[{listingId:id,productVariantId:'bad',quantity:1}]}));
});
test('shared quote transport verifies separate variants of one listing without trusting client prices',async()=>{
  const lines=[...input.lines,{listingId:id,quantity:1}];
  const quote=await requestCheckoutQuote(lines,{baseUrl:'https://test.invalid',fetchImpl:async(_url,request)=>{
    assert.deepEqual(JSON.parse(request.body).lines,lines);return Response.json({...calculateCheckoutQuote(lines,[product]),apiVersion:1});
  }});
  assert.equal(quote.subtotalMinor,35000);
});
test('checkout validates required contact and Indian delivery fields and strips claimed authority',()=>{
  const value=normalizeCheckout({...input,role:'admin',totalMinor:1,deliveryAddress:{...input.deliveryAddress,id:owner,isDefault:true}});
  assert.equal(value.customer.email,'customer@example.in');assert.equal('id' in value.deliveryAddress,false);assert.equal('role' in value,false);
  for(const patch of [{customer:{email:'bad'}},{deliveryAddress:{...input.deliveryAddress,postalCode:'000000'}},{deliveryAddress:{...input.deliveryAddress,phone:'123'}},{deliveryAddress:{...input.deliveryAddress,stateRegion:''}},{deliveryAddress:{...input.deliveryAddress,addressLine1:'bad\naddress'}},{deliveryAddress:{...input.deliveryAddress,countryCode:'US'}}])assert.throws(()=>normalizeCheckout({...input,...patch}));
});
test('review calculates shipping/tax only from server adapters and leaves missing charges unknown',async()=>{
  const result=await reviewCheckout({...input,shippingMinor:0,totalMinor:1},deps);assert.equal(result.totalMinor,31000);assert.equal(result.checkoutEnabled,false);assert.deepEqual(result.payment,{state:'disabled'});
  const partial=await reviewCheckout(input,{loadProducts:deps.loadProducts});assert.equal(partial.totalMinor,null);assert.equal(partial.shipping,null);assert.equal(partial.taxMinor,null);
  await assert.rejects(reviewCheckout(input,{...deps,shipping:{quote:async()=>({id:'bad',currencyCode:'INR',amountMinor:0,expiresAt:'2020-01-01'})}}),/expired/);
});

// Isolated in-process adapter. This validates orchestration, not PostgreSQL locking/RLS.
function repository(){const orders=new Map();let stock=3,writes=0;return{atomic:true,orders,get stock(){return stock;},get writes(){return writes;},async createPendingOrder(command){
  const fingerprint=JSON.stringify({lines:command.lines,address:command.deliveryAddress,total:command.expectedTotalMinor});
  const replay=orders.get(command.customerId+command.idempotencyKey);if(replay){if(replay.fingerprint!==fingerprint)throw Error('Idempotency conflict');return replay.order;}
  const qty=command.lines.reduce((sum,line)=>sum+line.quantity,0);if(qty>stock)throw Error('Insufficient stock');
  if(command.expectedSubtotalMinor!==12500*qty)throw Error('Price changed');
  const order={id:other,customer_profile_id:command.customerId,market_code:'IN',order_status:'pending',currency_code:'INR',subtotal_minor:command.expectedSubtotalMinor,delivery_minor:command.shippingQuote.amountMinor,tax_minor:command.taxMinor,total_minor:command.expectedTotalMinor,created_at:'2026-11-06T12:00:00Z'};
  stock-=qty;writes++;orders.set(command.customerId+command.idempotencyKey,{fingerprint,order});return order;
}};}
test('sandbox order creation persists once with an idempotency key, reserves mock stock and never marks payment paid',async()=>{
  const repo=repository(),payments=[];const services={...deps,repository:repo,payments:{mode:'sandbox',prepare:async command=>{payments.push(command);return{reference:'sandbox-only'};}}};
  const result=await createCheckoutOrder({...input,idempotencyKey:key},owner,services);
  const replay=await createCheckoutOrder({...input,idempotencyKey:key},owner,services);
  assert.equal(result.order.order_status,'pending');assert.equal(result.payment.state,'sandbox');assert.equal(replay.order.id,result.order.id);assert.equal(repo.writes,1);assert.equal(repo.stock,1);assert.equal(payments[0].idempotencyKey,`${other}:${key}`);
  await assert.rejects(createCheckoutOrder({...input,expectedTotalMinor:18500,lines:[{...input.lines[0],quantity:1}],idempotencyKey:key},owner,services),/Idempotency/);
});
test('concurrent mock order attempts cannot oversell; missing atomic backend and live adapters cannot write',async()=>{
  const repo=repository();const results=await Promise.allSettled([createCheckoutOrder({...input,idempotencyKey:key},owner,{...deps,repository:repo}),createCheckoutOrder({...input,idempotencyKey:id},owner,{...deps,repository:repo})]);
  assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(repo.writes,1);
  await assert.rejects(createCheckoutOrder({...input,idempotencyKey:key},owner,deps),/transactional backend/);
  const untouched=repository();await assert.rejects(createCheckoutOrder({...input,idempotencyKey:key},owner,{...deps,repository:untouched,payments:{mode:'live',prepare(){throw Error();}}}),/Live payments/);assert.equal(untouched.writes,0);
  await assert.rejects(createCheckoutOrder({...input,idempotencyKey:key},owner,{loadProducts:deps.loadProducts,repository:untouched}),/Shipping and tax/);assert.equal(untouched.writes,0);
});
test('payment preparation failures retain the pending order for reconciliation instead of claiming no order exists',async()=>{
  const repo=repository();const result=await createCheckoutOrder({...input,idempotencyKey:key},owner,{...deps,repository:repo,payments:{mode:'sandbox',prepare:async()=>{throw Error('provider offline');}}});
  assert.equal(result.order.order_status,'pending');assert.equal(result.payment.state,'unavailable');assert.equal(repo.writes,1);
});
test('unaccepted changed totals cannot create an order or invoke a payment adapter',async()=>{
  const repo=repository();let payments=0;
  await assert.rejects(createCheckoutOrder({...input,expectedTotalMinor:1,idempotencyKey:key},owner,{...deps,repository:repo,payments:{mode:'sandbox',prepare:async()=>{payments++;return{reference:'test'};}}}),/changed/);
  assert.equal(repo.writes,0);assert.equal(payments,0);
});
test('new mock orders are consumable by the existing owner-scoped order history contract',async()=>{
  const created=await createCheckoutOrder({...input,idempotencyKey:key},owner,{...deps,repository:repository()});
  const calls=[];const query={then:resolve=>Promise.resolve({data:[created.order],error:null}).then(resolve)};for(const method of ['select','eq','order','limit'])query[method]=(...args)=>{calls.push([method,...args]);return query;};
  const handler=createBuyerOrderHistoryHandler({authenticate:async()=>({state:'authenticated',user:{id:owner},supabase:{from:()=>query}})});
  const url=new URL('https://test.invalid/api/buyer/orders');const response=await handler({request:new Request(url),url});
  assert.equal((await response.json()).orders[0].id,other);assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='customer_profile_id'&&call[2]===owner));
});
test('checkout API gates origin, identity, body size and default order creation without hosted writes',async()=>{
  let load=0;const authenticate=async()=>({state:'authenticated',user:{id:owner}}),dependencies=async()=>{load++;return deps;};
  const handler=createCheckoutHandler({authenticate,dependencies});
  const request=(body,headers={})=>({request:new Request('https://test.invalid/api/checkout/review',{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json',...headers},body:JSON.stringify(body)})});
  assert.equal((await handler(request(input,{origin:'https://foreign.invalid'}))).status,403);assert.equal(load,0);
  assert.equal((await handler(request({...input,noise:'x'.repeat(17000)}))).status,413);
  const result=await handler(request(input));assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal((await result.json()).profileId,owner);
  const order=createCheckoutHandler({authenticate,dependencies,createOrder:true});assert.equal((await order(request(input,{'x-vetit-profile-id':other}))).status,409);
  assert.equal((await order(request({...input,idempotencyKey:key},{'x-vetit-profile-id':owner}))).status,503);
});
test('checkout review transport consumes the actual handler and rejects tampered summary totals',async()=>{
  const handler=createCheckoutHandler({authenticate:async()=>({state:'authenticated',user:{id:owner}}),dependencies:async()=>deps});
  const result=await requestCheckoutReview(input,{baseUrl:'https://test.invalid',fetchImpl:async(url,options)=>handler({request:new Request(url,{...options,headers:{...options.headers,origin:'https://test.invalid'}})})});
  assert.equal(result.totalMinor,31000);
  const bad={...await reviewCheckout(input,deps),profileId:owner,totalMinor:1};await assert.rejects(requestCheckoutReview(input,{baseUrl:'https://test.invalid',fetchImpl:async()=>Response.json(bad)}),/totals/);
});
test('returns enforce an explicit window and operational roles and never execute a refund',()=>{
  const base={state:'none',action:'request',role:'customer',deliveredAt:'2026-11-05T12:00:00Z',returnWindowDays:7,now};
  assert.equal(transitionReturn(base),'requested');assert.throws(()=>transitionReturn({...base,returnWindowDays:0}));assert.throws(()=>transitionReturn({...base,now:now+10*86400000}));
  assert.equal(transitionReturn({...base,state:'requested',action:'approve',role:'fulfillment_manager'}),'approved');assert.throws(()=>transitionReturn({...base,state:'requested',action:'approve',role:'catalog_manager'}));
  assert.equal(transitionReturn({...base,state:'received',action:'review_refund',role:'owner'}),'refund_pending');assert.throws(()=>transitionReturn({...base,state:'refund_pending',action:'refund',role:'owner'}));
});

test('public availability flows through real option loading into variant selection and checkout validation',async()=>{
  const makeClient=stockRows=>{
    const results=[{data:[{id:variant,listing_id:id,option_attributes:{size:'M'}}],count:1},{data:[{listing_id:id,product_variant_id:variant,amount_minor:12500}],count:1}];
    return{rpc:async()=>({data:stockRows}),from(){const result=results.shift(),query={then:resolve=>Promise.resolve(result).then(resolve)};for(const name of ['select','in','eq','order','limit','lte','or'])query[name]=()=>query;return query;}};
  };
  const [limited]=await loadProductOptions(makeClient([{variant_id:variant,max_quantity:2}]),[product]);
  assert.equal(limited.options[0].stockQuantity,2);
  assert.equal(selectProductOption(limited.options,variant,2).quantity,2);
  assert.throws(()=>selectProductOption(limited.options,variant,3),/stock/);
  assert.throws(()=>calculateCheckoutQuote([{listingId:id,productVariantId:variant,quantity:3}],[limited]),error=>error.code==='stock_unavailable');
  const [withdrawn]=await loadProductOptions(makeClient([]),[product]);assert.equal(withdrawn.options.length,0);
  const [soldOut]=await loadProductOptions(makeClient([{variant_id:variant,max_quantity:0}]),[product]);assert.throws(()=>selectProductOption(soldOut.options,variant,1),/stock/);
});

test('checkout review provides an actionable stock conflict without trusting backend error messages',async()=>{
  const handler=createCheckoutHandler({authenticate:async()=>({state:'authenticated',user:{id:owner}}),dependencies:async()=>({...deps,loadProducts:async()=>[{...product,options:[{...option,stockQuantity:1}]}]})});
  await assert.rejects(requestCheckoutReview(input,{baseUrl:'https://test.invalid',fetchImpl:async(url,options)=>handler({request:new Request(url,{...options,headers:{...options.headers,origin:'https://test.invalid'}})})}),/current stock.*Update your cart/);
  await assert.rejects(requestCheckoutReview(input,{baseUrl:'https://test.invalid',fetchImpl:async()=>Response.json({message:'Private backend diagnostic',code:'arbitrary'},{status:400})}),error=>!error.message.includes('Private backend diagnostic')&&error.message.includes('unavailable'));
});
