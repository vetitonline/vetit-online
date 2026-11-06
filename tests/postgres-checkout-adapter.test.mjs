import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createPostgresOrderRepository,issuePostgresCheckoutQuote } from '../src/lib/commerce/postgres-order-repository.server.js';
import { createCheckoutOrder } from '../src/lib/commerce/checkout-service.js';
import { createCheckoutHandler } from '../src/lib/commerce/checkout-api.js';
const owner='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002',key='10000000-0000-4000-8000-000000000003',quoteId='10000000-0000-4000-8000-000000000004';
const request={lines:[{listingId:id,productVariantId:id,quantity:1}],customer:{email:'customer@example.invalid'},deliveryAddress:{recipientName:'Synthetic',phone:'9876543210',addressLine1:'1 Synthetic Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}};
const order={id,customer_profile_id:owner,market_code:'IN',order_status:'pending',currency_code:'INR',subtotal_minor:10000,delivery_minor:500,tax_minor:100,total_minor:10600,created_at:'2026-11-06T12:00:00Z'};
const command={...request,customerId:owner,idempotencyKey:key,shippingQuote:{amountMinor:500},taxMinor:100,expectedSubtotalMinor:10000,expectedTotalMinor:10600};

test('database adapters fail closed without explicit approval and never read a secret or start a request',async()=>{
  let calls=0;const client={rpc(){calls++;throw Error('Should not be called');}};
  assert.throws(()=>createPostgresOrderRepository(client,{quoteId}),/approval/);
  await assert.rejects(issuePostgresCheckoutQuote(client,request,{customerId:owner,deliveryMinor:500,taxMinor:100,rateReference:'test'}),/approval/);
  assert.equal(calls,0);
});
test('repository sends only quote/key/consent/request, not caller prices, seller IDs or inventory writes',async()=>{
  const calls=[];const repo=createPostgresOrderRepository({rpc:async(name,args)=>{calls.push([name,args]);return{data:order,error:null};}},{approved:true,quoteId});
  const result=await repo.createPendingOrder({...command,claimedSellerId:owner});
  assert.equal(result.customer_profile_id,owner);assert.deepEqual(Object.keys(calls[0][1]).sort(),['p_expected_total','p_idempotency_key','p_quote_id','p_request']);
  assert.equal(calls[0][0],'place_my_order');assert.equal(calls[0][1].p_quote_id,quoteId);
  assert.equal('claimedSellerId' in calls[0][1].p_request,false);
});
test('unknown writes are not retried and error messages never disclose database diagnostics',async()=>{
  for(const code of ['23514','42501','22023','40P01','XX000']){
    let calls=0;const repo=createPostgresOrderRepository({rpc:async()=>{calls++;return{data:null,error:{code,message:'PRIVATE SQL'}};}},{approved:true,quoteId});
    await assert.rejects(repo.createPendingOrder(command),error=>!error.message.includes('PRIVATE')&&[403,409,503].includes(error.status));assert.equal(calls,1);
  }
});
test('repository rejects foreign owners, malformed snapshots and mismatched charge components',async()=>{
  for(const value of [{...order,customer_profile_id:id},{...order,total_minor:1},{...order,subtotal_minor:9900,tax_minor:200}]){
    const repo=createPostgresOrderRepository({rpc:async()=>({data:value,error:null})},{approved:true,quoteId});await assert.rejects(repo.createPendingOrder(command));
  }
});
test('trusted quote adapter normalizes request and requires authoritative bounded charges',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return{error:null,data:{id:quoteId,subtotalMinor:10000,deliveryMinor:500,taxMinor:100,totalMinor:10600,currencyCode:'INR',expiresAt:'2099-01-01T00:00:00Z'}};}};
  const result=await issuePostgresCheckoutQuote(client,{...request,role:'admin',totalMinor:1},{approved:true,customerId:owner,deliveryMinor:500,taxMinor:100,rateReference:'approved-test-rates',ttlSeconds:60});
  assert.equal(result.totalMinor,10600);assert.equal(calls[0][0],'issue_checkout_quote');assert.equal(calls[0][1].p_customer_id,owner);assert.equal(calls[0][1].p_request.role,undefined);
});
test('successful replay precedes expired offers and does not create or prepare a payment again',async()=>{
  const calls=[];const repo=createPostgresOrderRepository({rpc:async(name)=>{calls.push(name);return{data:{...order,order_status:'cancelled'},error:null};}},{approved:true,quoteId});
  const result=await createCheckoutOrder({...request,idempotencyKey:key,expectedTotalMinor:10600},owner,{repository:repo,loadProducts:async()=>{throw Error('Expired offers must not be reloaded.');},payments:{mode:'sandbox',prepare:async()=>{throw Error('No new payment.');}}});
  assert.equal(result.state,'existing');assert.equal(result.order.order_status,'cancelled');assert.deepEqual(calls,['get_my_checkout_order']);assert.equal(result.payment.state,'disabled');
});
test('cancellation uses the customer-scoped RPC and validates the returned state',async()=>{
  const calls=[];const repo=createPostgresOrderRepository({rpc:async(name,args)=>{calls.push([name,args]);return{data:{...order,order_status:'cancelled'},error:null};}},{approved:true,quoteId});
  assert.equal((await repo.cancelOrder({orderId:id,customerId:owner})).order_status,'cancelled');assert.deepEqual(calls,[['cancel_my_checkout_order',{p_order_id:id}]]);
});
test('hosted order handler defaults disabled, even with a working injected repository',async()=>{
  let dependencies=0;const options={authenticate:async()=>({state:'authenticated',user:{id:owner}}),dependencies:async()=>{dependencies++;throw Error('Not allowed');},createOrder:true};
  const context=()=>({request:new Request('https://test.invalid/api/checkout/orders',{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json','x-vetit-profile-id':owner},body:JSON.stringify(request)})});
  assert.equal((await createCheckoutHandler(options)(context())).status,503);assert.equal(dependencies,0);
  assert.match(fs.readFileSync(new URL('../src/lib/commerce/runtime-checkout.ts',import.meta.url),'utf8'),/HOSTED_ORDER_CREATION_ENABLED\s*=\s*false/);
  assert.match(fs.readFileSync(new URL('../src/pages/api/checkout/orders.ts',import.meta.url),'utf8'),/orderCreationEnabled:HOSTED_ORDER_CREATION_ENABLED/);
});
test('existing order replay API returns 200 with no payment preparation',async()=>{
  const handler=createCheckoutHandler({createOrder:true,orderCreationEnabled:true,authenticate:async()=>({state:'authenticated',user:{id:owner}}),dependencies:async()=>({repository:{atomic:true,findExistingOrder:async()=>order},loadProducts:async()=>{throw Error('No repricing');}})});
  const response=await handler({request:new Request('https://test.invalid/api/checkout/orders',{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json','x-vetit-profile-id':owner},body:JSON.stringify({...request,idempotencyKey:key,expectedTotalMinor:10600})})});
  assert.equal(response.status,200);assert.equal((await response.json()).state,'existing');
});
test('fulfilment adapter falls back only for an absent new RPC, never after rejection or an unknown write',async()=>{
  const source=fs.readFileSync(new URL('../src/lib/supabase/proposed-commerce-rpc.ts',import.meta.url),'utf8');
  const exports={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
  for(const code of ['PGRST202','42501','XX000',null]){
    const calls=[];await exports.callProposedCommerceRpc({rpc:async(name)=>{calls.push(name);return{data:code?null:id,error:code?{code}:null};}},'advance_seller_fulfilment',{p_fulfilment_id:id,p_next_status:'packed',p_carrier:null,p_tracking_reference:null});
    assert.deepEqual(calls,code==='PGRST202'?['advance_checkout_fulfilment','advance_seller_fulfilment']:['advance_checkout_fulfilment']);
  }
});
