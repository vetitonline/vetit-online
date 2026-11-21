import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutOrder, CheckoutError } from '../src/lib/commerce/checkout-service.js';
import { createCheckoutHandler } from '../src/lib/commerce/checkout-api.js';
import { CheckoutQuoteError } from '../src/lib/commerce/checkout-quote.js';
const owner='10000000-0000-4000-8000-000000000001';
const input={idempotencyKey:owner,expectedTotalMinor:120,lines:[{listingId:owner,quantity:1}],customer:{email:'buyer@example.in'},deliveryAddress:{recipientName:'Buyer',phone:'9876543210',addressLine1:'1 Test Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}};
const request=(body=input,method='POST')=>({request:new Request('https://test.invalid/api/checkout/orders',{method,headers:{origin:'https://test.invalid','content-type':'application/json','x-vetit-profile-id':owner},...(method==='POST'?{body:JSON.stringify(body)}:{})})});
const auth=async()=>({state:'authenticated',user:{id:owner}});
const forbidden=()=>{throw Error('Unexpected downstream access');};
test('invalid totals never reach reconciliation, catalogue, writes or payment',async()=>{
  for(const expectedTotalMinor of [undefined,null,-1,1.5,'120',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    await assert.rejects(createCheckoutOrder({...input,expectedTotalMinor},owner,{repository:{atomic:true,findExistingOrder:forbidden,createPendingOrder:forbidden},loadProducts:forbidden,payments:{mode:'sandbox',prepare:forbidden}}),error=>error.code==='invalid_total'&&error.status===400);
  }
});
test('malformed selections fail before the idempotency lookup',async()=>{
  await assert.rejects(createCheckoutOrder({...input,lines:[{listingId:owner,quantity:100}]},owner,{repository:{atomic:true,findExistingOrder:forbidden,createPendingOrder:forbidden},loadProducts:forbidden}),error=>error.code==='invalid_line');
});
test('disabled hosted ordering never constructs database or payment dependencies',async()=>{
  const response=await createCheckoutHandler({authenticate:auth,dependencies:forbidden,createOrder:true})(request());
  assert.equal(response.status,503);assert.equal((await response.json()).code,'order_creation_disabled');
});
test('non-POST checkout is refused before authentication or downstream access',async()=>{
  const handler=createCheckoutHandler({authenticate:forbidden,dependencies:forbidden});
  for(const method of ['GET','DELETE','PUT']) assert.equal((await handler(request(input,method))).status,405);
});
test('review exposes stable validation and availability codes without server exception details',async()=>{
  for(const [error,status,code] of [[new CheckoutQuoteError('stock_unavailable','Insufficient stock'),400,'stock_unavailable'],[new CheckoutQuoteError('listing_unavailable','Product removed'),400,'listing_unavailable'],[new CheckoutError('Reprice',409,'price_changed'),409,'price_changed'],[new CheckoutError('Expired shipping',503,'shipping_unavailable'),503,'shipping_unavailable'],[Error('secret database details'),503,'checkout_unavailable']]) {
    const response=await createCheckoutHandler({authenticate:auth,dependencies:async()=>{throw error;}})(request());
    const body=await response.json();assert.equal(response.status,status);assert.equal(body.code,code);assert.doesNotMatch(body.message,/secret database/);assert.match(response.headers.get('cache-control'),/no-store/);
  }
});
test('current server price and stock remain authority before any order write',async()=>{
  for(const [stock,expectedTotalMinor,code] of [[0,120,'stock_unavailable'],[2,120,'price_changed']]) {
    await assert.rejects(createCheckoutOrder({...input,expectedTotalMinor},owner,{
      repository:{atomic:true,findExistingOrder:async()=>null,createPendingOrder:forbidden},
      loadProducts:async()=>[{id:owner,title:'Test',currencyCode:'INR',options:[{variantId:null,priceMinor:200,stockQuantity:stock}]}],
      shipping:{quote:async()=>({id:'fixture',currencyCode:'INR',amountMinor:0,expiresAt:'2099-01-01T00:00:00Z'})},taxes:{quote:async()=>({currencyCode:'INR',amountMinor:0})},
    }),error=>error.code===code);
  }
});

test('shared review client uses only approved error messages and never reflects server text',async()=>{
  const {requestCheckoutReview}=await import('../src/lib/commerce/checkout-review-client.js');
  for(const [code,status,pattern] of [['stock_unavailable',400,/current stock/],['listing_unavailable',400,/no longer available/],['price_unavailable',400,/available price/],['shipping_unavailable',503,/Delivery charges/],['tax_unavailable',503,/Tax calculation/],['__proto__',400,/No order or payment/],['unknown',503,/No order or payment/]]) {
    await assert.rejects(requestCheckoutReview(input,{baseUrl:'https://test.invalid',fetchImpl:async()=>Response.json({code,message:'secret database detail'},{status})}),error=>{assert.match(error.message,pattern);assert.doesNotMatch(error.message,/secret database/);assert.equal(error.status,status);return true;});
  }
});
