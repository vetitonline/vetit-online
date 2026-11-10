import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCheckoutLifecycleWorker} from '../src/lib/commerce/checkout-lifecycle.server.js';
import {createCheckoutRateIssuer} from '../src/lib/commerce/checkout-rates.server.js';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
export async function runCheckoutLifecycleCases(t,{sql,actor,issue,place,request,products,alice,bob,seller,business}){
 const call=async(name,args)=>JSON.parse(await actor(null,`select public.${name}(${Object.values(args).map(v=>v===null?'null':typeof v==='number'?String(v):typeof v==='object'?literal(JSON.stringify(v))+'::jsonb':literal(v)).join(',')})`,'service_role')||'null');
 const client={rpc:async(name,args)=>{try{return{data:await call(name,args),error:null};}catch(error){return{data:null,error:{code:'XX000',message:error.message}};}}};
 const create=async()=>{const input=request([26],1);return place(await issue(input),input);};
 const enroll=order=>call('enroll_checkout_lifecycle',{p_order_id:order.id,p_ttl_seconds:60});
 const get=order=>call('get_checkout_lifecycle',{p_order_id:order.id});
 const due=order=>sql(`update vetit_checkout.lifecycle set expires_at=clock_timestamp()-interval '1 second' where order_id='${order.id}'`);
 const begin=order=>call('begin_checkout_payment_attempt',{p_order_id:order.id,p_provider:'synthetic'});
 const bind=attempt=>call('bind_checkout_payment_reference',{p_attempt_id:attempt.id,p_reference:'SYNTHETIC-'+attempt.id});
 const expire=order=>call('expire_checkout_reservation',{p_order_id:order.id});
 const evidence=(current,status,options={})=>({p_attempt_id:current.attempt.id,p_event_id:options.eventId??randomUUID(),p_reference:current.attempt.reference,p_status:status,p_amount_minor:options.amount??current.amountMinor,p_currency_code:options.currency??'INR',p_observed_at:options.observedAt??new Date().toISOString()});
 const observe=(current,status,options)=>call('reconcile_checkout_payment',evidence(current,status,options));
 const reserved=order=>sql(`select sum(i.quantity_reserved) from public.inventory_levels i join vetit_checkout.reservations r on r.inventory_id=i.id where r.order_id='${order.id}'`);
 const released=order=>sql(`select bool_and(released) from vetit_checkout.reservations where order_id='${order.id}'`);
 await t.test('lifecycle and charge RPCs are service-only; private payment evidence stays inaccessible',async()=>{
  const order=await create();
  for(const role of ['anon','authenticated']){
   await assert.rejects(actor(alice,`select public.enroll_checkout_lifecycle('${order.id}',60)`,role),/permission denied/);
   await assert.rejects(actor(alice,`select public.get_checkout_lifecycle('${order.id}')`,role),/permission denied/);
   await assert.rejects(actor(alice,`select public.expire_checkout_reservation('${order.id}')`,role),/permission denied/);
   await assert.rejects(actor(alice,`select public.get_checkout_rate_basis('{}')`,role),/permission denied/);
   await assert.rejects(actor(alice,`select * from vetit_checkout.payment_observations`,role),/permission denied/);
  }
  await assert.rejects(call('enroll_checkout_lifecycle',{p_order_id:order.id,p_ttl_seconds:0}),/policy/);
  const first=await enroll(order),again=await enroll(order);assert.equal(first.expiresAt,again.expiresAt);
  assert.equal(await sql(`select l.expires_at=(select min(e.created_at)+interval '60 seconds' from vetit_checkout.order_events e where e.order_id=l.order_id and e.new_status='pending') from vetit_checkout.lifecycle l where l.order_id='${order.id}'`),'t');
  await assert.rejects(call('enroll_checkout_lifecycle',{p_order_id:order.id,p_ttl_seconds:120}),/immutable/);
  await assert.rejects(actor(null,`select * from vetit_checkout.lifecycle`,'service_role'),/permission denied/);
 });
 await t.test('expiry uses a distinct reservation deadline and concurrent workers release stock and cancel fulfilments exactly once',async()=>{
  const order=await create();await enroll(order);assert.equal((await expire(order)).outcome,'not_due');assert.equal(await released(order),'f');
  await due(order);const results=await Promise.all([expire(order),expire(order),expire(order)]);
  assert.equal(results.filter(r=>r.outcome==='expired').length,1);assert.equal(await released(order),'t');
  assert.equal(await sql(`select order_status from public.orders where id='${order.id}'`),'cancelled');
  assert.equal(await sql(`select bool_and(status='cancelled') from public.fulfilments where order_id='${order.id}'`),'t');
  assert.equal(await sql(`select count(*) from vetit_checkout.order_events where order_id='${order.id}' and new_status='cancelled'`),'1');
  assert.ok((await get(order)).expiredAt);await assert.rejects(begin(order),/Pending enrolled/);
 });
 await t.test('expiry rollback restores reservations, order and deadline metadata after a downstream failure',async()=>{
  const order=await create();await enroll(order);await due(order);const before=await reserved(order);
  await assert.rejects(actor(null,`set local vetit.test.failure='yes';select public.expire_checkout_reservation('${order.id}')`,'service_role'),/Synthetic downstream failure/);
  assert.equal(await released(order),'f');assert.equal(await reserved(order),before);assert.equal((await get(order)).expiredAt,null);
  assert.equal((await expire(order)).outcome,'expired');
 });
 await t.test('starting, pending and authorized attempts block both expiry and customer cancellation',async()=>{
  const order=await create();await enroll(order);const registered=await begin(order);await due(order);
  assert.equal((await expire(order)).outcome,'blocked_payment');
  await assert.rejects(actor(alice,`select public.cancel_my_checkout_order('${order.id}')`),/terminal payment/);
  const bound=await bind(registered.attempt);assert.equal((await expire(order)).outcome,'blocked_payment');
  await observe(bound,'authorized');assert.equal((await expire(order)).outcome,'blocked_payment');assert.equal(await released(order),'f');
  await observe(bound,'cancelled');assert.equal((await expire(order)).outcome,'expired');
 });
 await t.test('capture reconciliation atomically confirms the matching order and deduplicates immutable provider events',async()=>{
  const order=await create();await enroll(order);let current=await begin(order);current=await bind(current.attempt);
  const event=evidence(current,'captured');const results=await Promise.all([call('reconcile_checkout_payment',event),call('reconcile_checkout_payment',event)]);
  assert.equal(results.filter(r=>r.replayed).length,1);assert.ok(results.every(r=>r.outcome==='applied'));
  assert.equal((await get(order)).orderStatus,'confirmed');assert.equal(await released(order),'f');
  assert.equal(await sql(`select count(*) from public.payments where order_id='${order.id}' and status='captured'`),'1');
  assert.equal(await sql(`select count(*) from vetit_checkout.order_events where order_id='${order.id}' and new_status='confirmed'`),'1');
  await assert.rejects(call('reconcile_checkout_payment',{...event,p_amount_minor:1}),/conflicts/);await due(order);assert.equal((await expire(order)).outcome,'not_pending');
  await observe(current,'pending');assert.equal((await get(order)).attempt.status,'captured');
 });
 await t.test('failed capture transaction rolls back payment, observation and order changes together',async()=>{
  const order=await create();await enroll(order);const current=await bind((await begin(order)).attempt),event=evidence(current,'captured');
  const values=Object.values(event).map(v=>typeof v==='number'?v:literal(v)).join(',');
  await assert.rejects(actor(null,`set local vetit.test.failure='yes';select public.reconcile_checkout_payment(${values})`,'service_role'),/Synthetic downstream failure/);
  assert.equal((await get(order)).orderStatus,'pending');assert.equal((await get(order)).attempt.status,'pending');
  assert.equal(await sql(`select status from public.payments where id='${current.attempt.paymentId}'`),'pending');
  assert.equal(await sql(`select count(*) from vetit_checkout.payment_observations where attempt_id='${current.attempt.id}'`),'0');
  assert.equal((await call('reconcile_checkout_payment',event)).outcome,'applied');
 });
 await t.test('amount/currency mismatch and late captures retain evidence for review without confirming or reacquiring released stock',async()=>{
  for(const mismatch of [{amount:1},{currency:'USD'}]){
   const order=await create();await enroll(order);const current=await bind((await begin(order)).attempt);
   assert.equal((await observe(current,'captured',mismatch)).outcome,'review_required');assert.equal((await get(order)).orderStatus,'pending');assert.equal((await get(order)).attempt.needsReview,true);
   await due(order);assert.equal((await expire(order)).outcome,'blocked_payment');
  }
  const order=await create();await enroll(order);const current=await bind((await begin(order)).attempt);await observe(current,'cancelled');await due(order);assert.equal((await expire(order)).outcome,'expired');
  const before=await reserved(order);assert.equal((await observe(current,'captured')).outcome,'review_required');assert.equal((await get(order)).orderStatus,'cancelled');assert.equal(await released(order),'t');assert.equal(await reserved(order),before);
  assert.equal(await sql(`select status from public.payments where id='${current.attempt.paymentId}'`),'cancelled');
  assert.equal(await sql(`select observation->>'status' from vetit_checkout.payment_observations where attempt_id='${current.attempt.id}' and outcome='review_required'`),'captured');
 });
 await t.test('expiry/capture races preserve unresolved stock or retain late financial evidence, never resurrect cancelled orders',async()=>{
  const order=await create();await enroll(order);const current=await bind((await begin(order)).attempt);await due(order);
  const result=await Promise.all([observe(current,'captured'),expire(order)]);assert.equal(result[0].outcome,'applied');assert.equal((await get(order)).orderStatus,'confirmed');assert.equal(await released(order),'f');
  const failed=await create();await enroll(failed);const f=await bind((await begin(failed)).attempt);await observe(f,'failed');await due(failed);
  const race=await Promise.all([observe(f,'captured'),expire(failed)]);assert.equal(race[0].outcome,'review_required');const final=await get(failed);assert.ok(['pending','cancelled'].includes(final.orderStatus));assert.equal(final.attempt.needsReview,true);
  assert.equal(await released(failed),final.orderStatus==='cancelled'?'t':'f');
 });
 await t.test('registered payment binding, monotonic states and review flags protect cancellation and dispatch',async()=>{
  const order=await create();await enroll(order);const current=await bind((await begin(order)).attempt);
  await assert.rejects(sql(`update public.payments set amount_minor=1 where id='${current.attempt.paymentId}'`),/binding required/);
  await assert.rejects(sql(`insert into public.payments(order_id,customer_profile_id,provider,provider_payment_reference,status,amount_minor,currency_code) values('${order.id}','${alice}','synthetic','unregistered','captured',${order.total_minor},'INR')`),/binding required/);
  await observe(current,'captured');await assert.rejects(sql(`update public.payments set status='pending' where id='${current.attempt.paymentId}'`),/regression/);
  await observe(current,'failed');const shipment=await sql(`select id from public.fulfilments where order_id='${order.id}'`);
  await assert.rejects(actor(seller,`select public.advance_checkout_fulfilment('${shipment}','packed')`),/manual reconciliation/);
 });
 await t.test('sandbox worker prepares once, verifies captured status, and safely rotates due blocked candidates',async()=>{
  const records=new Map();let creates=0,unavailable=false;
  const provider={mode:'sandbox',name:'synthetic',create:async input=>{creates++;assert.equal(input.idempotencyKey,input.attemptId);records.set(input.orderId,{...input,reference:'SYNTHETIC-'+input.attemptId});return{reference:'SYNTHETIC-'+input.attemptId};},getVerifiedStatus:async input=>{if(unavailable)throw Error('Synthetic provider outage');const row=records.get(input.orderId);return{...input,eventId:'EVENT-'+input.attemptId,status:'captured',amountMinor:row.amountMinor,currencyCode:'INR',observedAt:new Date().toISOString(),verified:true,mode:'sandbox'};}};
  const worker=createCheckoutLifecycleWorker({approved:true,client,provider,reservationTtlSeconds:60});
  const order=await create(),command={orderId:order.id,amountMinor:order.total_minor,currencyCode:'INR'};await worker.payments.prepare(command);await worker.payments.prepare(command);assert.equal(creates,1);
  assert.equal((await worker.reconcile(order.id)).outcome,'applied');assert.equal((await get(order)).orderStatus,'confirmed');
  const blocked=await create();await worker.payments.prepare({orderId:blocked.id,amountMinor:blocked.total_minor,currencyCode:'INR'});await due(blocked);unavailable=true;
  const before=await released(blocked);const result=await worker.expireDue(100);assert.ok(result.results.some(r=>r.orderId===blocked.id&&r.outcome==='blocked_payment'&&r.reconciliation==='unavailable'));assert.equal(await released(blocked),before);
  assert.equal(await sql(`select last_checked_at is not null from vetit_checkout.lifecycle where order_id='${blocked.id}'`),'t');
 });
 await t.test('manual payment review queue paginates closed-order evidence without exposing table access',async()=>{
  let after=null,pages=0;const rows=[];
  do{const page=await call('list_checkout_payment_reviews',{p_limit:2,p_after:after});rows.push(...page.reviews);after=page.nextAfter;pages++;assert.ok(pages<20);}while(after);
  assert.ok(rows.length>=4);assert.equal(new Set(rows.map(r=>r.attemptId)).size,rows.length);assert.ok(rows.some(r=>r.orderStatus==='cancelled'&&r.evidence.status==='captured'));
  await assert.rejects(actor(alice,'select public.list_checkout_payment_reviews(10,null)'),/permission denied/);
 });
 await t.test('sandbox shipping/tax bridge finalizes a price/seller-bound quote with an absolute provider expiry cap',async()=>{
  const validUntil=new Date(Date.now()+180000).toISOString(),input=request([26],1);let seen;
  const issuer=createCheckoutRateIssuer({approved:true,client,reservationTtlSeconds:60,shipping:{mode:'sandbox',quote:async context=>{seen=context;return{id:'shipping-synthetic',currencyCode:'INR',amountMinor:500,expiresAt:validUntil};}},taxes:{mode:'sandbox',quote:async context=>{assert.equal(context.shipping.amountMinor,500);assert.equal(context.items[0].businessId,business);return{id:'tax-synthetic',currencyCode:'INR',amountMinor:100,expiresAt:validUntil};}}});
  const quote=await issuer.issue({...input,totalMinor:1,deliveryMinor:0,taxMinor:0},alice);assert.equal(quote.totalMinor,10600);assert.equal(seen.subtotalMinor,10000);assert.ok(Date.parse(quote.expiresAt)<=Date.parse(validUntil));const beforeLife=await sql('select count(*) from vetit_checkout.lifecycle');
  await assert.rejects(actor(alice,`set local vetit.test.failure='yes';select public.place_my_order('${quote.id}','${randomUUID()}',${quote.totalMinor},${literal(JSON.stringify(input))}::jsonb)`),/Synthetic downstream failure/);
  assert.equal(await sql('select count(*) from vetit_checkout.lifecycle'),beforeLife);
  const placed=await place(quote,input);assert.equal(placed.total_minor,10600);assert.equal((await get(placed)).attempt,null);await due(placed);assert.equal((await expire(placed)).outcome,'expired');
  assert.equal(await sql(`select shipping_reference from vetit_checkout.rate_snapshots where quote_id='${quote.id}'`),'shipping-synthetic');
  const basis=await call('get_checkout_rate_basis',{p_request:input}),before=await sql(`select count(*) from vetit_checkout.quotes`);
  await assert.rejects(call('issue_checkout_rated_quote',{p_customer_id:alice,p_request:input,p_expected_items:[{...basis.items[0],businessId:bob}],p_delivery_minor:500,p_tax_minor:100,p_shipping_reference:'ship',p_tax_reference:'tax',p_valid_until:validUntil,p_ttl_seconds:300,p_reservation_ttl_seconds:60}),/basis changed/);
  assert.equal(await sql(`select count(*) from vetit_checkout.quotes`),before);
 });
}
