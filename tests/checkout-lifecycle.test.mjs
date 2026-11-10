import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutLifecycleWorker} from '../src/lib/commerce/checkout-lifecycle.server.js';
import {createCheckoutRateIssuer} from '../src/lib/commerce/checkout-rates.server.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={lines:[{listingId:id(4),productVariantId:id(5),quantity:2}],customer:{email:'synthetic@example.invalid'},deliveryAddress:{recipientName:'Synthetic Customer',phone:'9876543210',addressLine1:'1 Synthetic Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}};
const basis=[{listingId:id(4),productVariantId:id(5),businessId:id(6),quantity:2,unitPriceMinor:5000,title:'Synthetic feed',sellerSku:'SYN-M',optionAttributes:{size:'M'}}];
const snapshot=()=>({orderId:id(1),customerId:id(2),orderStatus:'pending',amountMinor:10600,currencyCode:'INR',expiresAt:'2099-11-10T12:00:00Z',expiredAt:null,attempt:{id:id(3),provider:'synthetic',reference:null,status:'starting',needsReview:false,paymentId:id(7)}});
function fixture(){
 let value=snapshot(),status='captured',verified=true,outcome='applied',proofPatch={},due=[id(1)];const calls=[],creates=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='bind_checkout_payment_reference')value={...value,attempt:{...value.attempt,reference:args.p_reference,status:'pending'}};
  return{data:name==='reconcile_checkout_payment'?{orderId:id(1),outcome,replayed:false}:name==='list_due_checkout_reservations'?due:name==='expire_checkout_reservation'?{orderId:id(1),outcome:'blocked_payment'}:structuredClone(value)};
 }};
 const provider={mode:'sandbox',name:'synthetic',create:async command=>{creates.push(command);return{reference:'synthetic-reference'};},getVerifiedStatus:async command=>({...command,mode:'sandbox',verified,eventId:'event-1',status,amountMinor:10600,currencyCode:'INR',observedAt:'2026-11-10T12:00:00Z',...proofPatch})};
 return{client,provider,calls,creates,options:{approved:true,client,provider,reservationTtlSeconds:900,now:()=>Date.parse('2026-11-10T12:00:00Z')},set:value_=>value=value_,proof:patch=>{proofPatch=patch;},outcome:value_=>outcome=value_,due:value_=>due=value_};
}
test('lifecycle is disabled without explicit sandbox approval and policy; live providers cannot create side effects',()=>{
 const f=fixture();for(const patch of [{approved:false},{provider:{...f.provider,mode:'live'}},{reservationTtlSeconds:undefined},{reservationTtlSeconds:59},{reservationTtlSeconds:86401}])assert.throws(()=>createCheckoutLifecycleWorker({...f.options,...patch}));assert.equal(f.calls.length,0);assert.equal(f.creates.length,0);
});
test('payment intent registers before provider creation and binding; retries retain the registered idempotency key',async()=>{
 const f=fixture(),worker=createCheckoutLifecycleWorker(f.options);assert.equal((await worker.payments.prepare({orderId:id(1),amountMinor:10600,currencyCode:'INR'})).reference,'synthetic-reference');
 assert.deepEqual(f.calls.map(c=>c.name),['enroll_checkout_lifecycle','begin_checkout_payment_attempt','bind_checkout_payment_reference']);assert.equal(f.creates[0].idempotencyKey,id(3));assert.equal(f.creates[0].attemptId,id(3));
 await worker.payments.prepare({orderId:id(1),amountMinor:10600,currencyCode:'INR'});assert.equal(f.creates.length,1);
});
test('uncertain provider creation never auto-retries, and an explicit recovery uses the same registered attempt',async()=>{
 const f=fixture();let calls=0;f.provider.create=async command=>{calls++;assert.equal(command.idempotencyKey,id(3));throw Error('PRIVATE provider diagnostic');};const worker=createCheckoutLifecycleWorker(f.options);
 for(let i=0;i<2;i++){await assert.rejects(worker.payments.prepare({orderId:id(1),amountMinor:10600,currencyCode:'INR'}),error=>error.message.includes('unconfirmed')&&!error.message.includes('PRIVATE'));assert.equal(calls,i+1);}assert.equal(f.calls.some(c=>c.name==='bind_checkout_payment_reference'),false);
});
test('tampered totals, closed orders and wrong-order snapshots cannot prepare an external payment',async()=>{
 for(const patch of [{orderId:id(9)},{currencyCode:'USD'},{orderStatus:'cancelled'}]){
  const f=fixture();f.set({...snapshot(),...patch});const worker=createCheckoutLifecycleWorker(f.options);await assert.rejects(worker.payments.prepare({orderId:id(1),amountMinor:10600,currencyCode:'INR'}));assert.equal(f.creates.length,0);
 }
 const f=fixture();await assert.rejects(createCheckoutLifecycleWorker(f.options).payments.prepare({orderId:id(1),amountMinor:1,currencyCode:'INR'}));assert.equal(f.creates.length,0);
});
test('reconciliation fetches independently verified provider status and rejects identity/reference/mode or unverified responses',async()=>{
 for(const patch of [{verified:false},{mode:'live'},{orderId:id(9)},{attemptId:id(9)},{reference:'foreign'},{eventId:'bad ref'},{status:'refunded'},{observedAt:'2099-01-01T00:00:00Z'}]){
  const f=fixture();f.set({...snapshot(),attempt:{...snapshot().attempt,reference:'synthetic-reference',status:'pending'}});f.proof(patch);await assert.rejects(createCheckoutLifecycleWorker(f.options).reconcile(id(1)));assert.equal(f.calls.some(c=>c.name==='reconcile_checkout_payment'),false);
 }
});
test('mismatched money remains explicit reconciliation evidence, never a client-side paid status',async()=>{
 const f=fixture();f.set({...snapshot(),attempt:{...snapshot().attempt,reference:'synthetic-reference',status:'pending'}});f.proof({amountMinor:1});f.outcome('review_required');const result=await createCheckoutLifecycleWorker(f.options).reconcile(id(1));assert.equal(result.outcome,'review_required');assert.equal(f.calls.at(-1).args.p_amount_minor,1);assert.equal(f.calls.some(c=>c.name==='confirm_checkout_order'),false);
});
test('expiry keeps provider outages separate from the atomic database eligibility decision and bounds batches',async()=>{
 const f=fixture();f.set({...snapshot(),attempt:{...snapshot().attempt,reference:'synthetic-reference',status:'pending'}});f.provider.getVerifiedStatus=async()=>{throw Error('PRIVATE outage');};const worker=createCheckoutLifecycleWorker(f.options),result=await worker.expireDue(1);
 assert.deepEqual(result.results,[{orderId:id(1),outcome:'blocked_payment',reconciliation:'unavailable'}]);assert.equal(f.calls.filter(c=>c.name==='expire_checkout_reservation').length,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 await assert.rejects(worker.expireDue(101));f.due([id(1),id(1)]);await assert.rejects(worker.expireDue(2));
});
function rateFixture(){
 const calls=[],contexts=[],expiry='2099-11-10T12:00:00Z';let items=structuredClone(basis);
 const client={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='get_checkout_rate_basis'?{items:structuredClone(items)}:{id:id(8),subtotalMinor:10000,deliveryMinor:500,taxMinor:100,totalMinor:10600,currencyCode:'INR',expiresAt:expiry}};}};
 const shipping={mode:'sandbox',quote:async context=>{contexts.push(context);return{id:'shipping-1',amountMinor:500,currencyCode:'INR',expiresAt:expiry};}},taxes={mode:'sandbox',quote:async context=>{contexts.push(context);return{id:'tax-1',amountMinor:100,currencyCode:'INR',expiresAt:expiry};}};
 return{calls,contexts,client,shipping,taxes,items:replacement=>items=replacement,options:{approved:true,client,shipping,taxes,reservationTtlSeconds:900}};
}
test('rate issuer is gated to explicit sandbox providers without implicit shipping/tax defaults',()=>{
 const f=rateFixture();for(const patch of [{approved:false},{shipping:undefined},{taxes:undefined},{shipping:{...f.shipping,mode:'live'}},{ttlSeconds:29}])assert.throws(()=>createCheckoutRateIssuer({...f.options,...patch}));assert.equal(f.calls.length,0);
});
test('shipping/tax amounts use the DB-resolved seller/price basis and ignore caller charge fields',async()=>{
 const f=rateFixture();const result=await createCheckoutRateIssuer(f.options).issue({...input,deliveryMinor:0,taxMinor:0,totalMinor:1,businessId:id(9)},id(2));assert.equal(result.totalMinor,10600);assert.equal(f.contexts[0].items[0].businessId,id(6));assert.equal(f.contexts[1].shipping.amountMinor,500);
 const args=f.calls.at(-1).args;assert.equal(args.p_delivery_minor,500);assert.equal(args.p_tax_minor,100);assert.deepEqual(args.p_expected_items,basis);assert.equal(args.p_customer_id,id(2));
});
test('foreign, malformed, duplicated or stale rate bases stop before external rate requests',async()=>{
 for(const items of [[{...basis[0],listingId:id(9)}],[{...basis[0],businessId:'bad'}],[{...basis[0],unitPriceMinor:0}],[basis[0],basis[0]]]){
  const f=rateFixture();f.items(items);await assert.rejects(createCheckoutRateIssuer(f.options).issue(input,id(2)));assert.equal(f.contexts.length,0);assert.equal(f.calls.length,1);
 }
});
test('provider mutation of a context cannot change the rate basis, and invalid charges never finalize a DB quote',async()=>{
 const f=rateFixture();f.shipping.quote=async context=>{context.items[0].unitPriceMinor=1;return{id:'shipping-1',amountMinor:500,currencyCode:'INR',expiresAt:'2099-11-10T12:00:00Z'};};await createCheckoutRateIssuer(f.options).issue(input,id(2));assert.equal(f.calls.at(-1).args.p_expected_items[0].unitPriceMinor,5000);
 for(const patch of [{currencyCode:'USD'},{amountMinor:-1},{amountMinor:1.5},{expiresAt:'2020-01-01T00:00:00Z'},{id:'bad ref'}]){
  const f=rateFixture(),original=f.shipping.quote;f.shipping.quote=async value=>({...await original(value),...patch});await assert.rejects(createCheckoutRateIssuer(f.options).issue(input,id(2)));assert.equal(f.calls.filter(c=>c.name==='issue_checkout_rated_quote').length,0);
 }
});
test('unknown quote responses are not automatically retried or presented as a trusted final price',async()=>{
 const f=rateFixture();let writes=0;const original=f.client.rpc;f.client.rpc=async(name,args)=>{if(name==='issue_checkout_rated_quote'){writes++;throw Error('PRIVATE transport error');}return original(name,args);};await assert.rejects(createCheckoutRateIssuer(f.options).issue(input,id(2)),error=>!error.message.includes('PRIVATE'));assert.equal(writes,1);
});
test('service-only review queue validates bounded pagination and preserves closed-order capture evidence',async()=>{
 const f=fixture(),review={attemptId:id(3),orderId:id(1),provider:'synthetic',reference:'reference-1',orderStatus:'cancelled',expectedAmountMinor:10600,currencyCode:'INR',evidence:{status:'captured',amountMinor:10600}};
 f.client.rpc=async(name,args)=>{assert.equal(name,'list_checkout_payment_reviews');assert.equal(args.p_after,null);return{data:{reviews:[review],nextAfter:null}};};
 const worker=createCheckoutLifecycleWorker(f.options),page=await worker.listReviews({limit:1});assert.equal(page.reviews[0].orderStatus,'cancelled');assert.equal(page.reviews[0].evidence.status,'captured');await assert.rejects(worker.listReviews({limit:101}));
 f.client.rpc=async()=>({data:{reviews:[review,review],nextAfter:null}});await assert.rejects(worker.listReviews());
});
test('a timed-out payment create remains unconfirmed and a late acknowledgement cannot bind or retry it',async()=>{
 const f=fixture();let finish,signal,creates=0;f.provider.create=async command=>{creates++;signal=command.signal;return new Promise(done=>finish=done);};const worker=createCheckoutLifecycleWorker({...f.options,timeoutMs:5});
 await assert.rejects(worker.payments.prepare({orderId:id(1),amountMinor:10600,currencyCode:'INR'}),/unconfirmed/);assert.equal(signal.aborted,true);assert.equal(creates,1);finish({reference:'late-response'});for(let i=0;i<5;i++)await Promise.resolve();assert.equal(f.calls.some(c=>c.name==='bind_checkout_payment_reference'),false);
});
test('provider status timeout keeps the due attempt blocked with no automatic provider retry',async()=>{
 const f=fixture();let calls=0;f.set({...snapshot(),attempt:{...snapshot().attempt,reference:'synthetic-reference',status:'pending'}});f.provider.getVerifiedStatus=()=>{calls++;return new Promise(()=>{});};const result=await createCheckoutLifecycleWorker({...f.options,timeoutMs:5}).expireDue(1);assert.equal(calls,1);assert.equal(result.results[0].outcome,'blocked_payment');assert.equal(result.results[0].reconciliation,'unavailable');
});
test('shipping/tax timeouts never finalize charges and propagate an aborted signal',async()=>{
 const f=rateFixture();let signal;f.shipping.quote=command=>{signal=command.signal;return new Promise(()=>{});};await assert.rejects(createCheckoutRateIssuer({...f.options,timeoutMs:5}).issue(input,id(2)));assert.equal(signal.aborted,true);assert.equal(f.calls.some(c=>c.name==='issue_checkout_rated_quote'),false);
});
