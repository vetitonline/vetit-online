import {withProviderDeadline} from './provider-deadline.server.js';
import {CheckoutError} from './checkout-service.js';
import {orderId} from '../buyer/order-contract.js';
const fail=message=>{throw new CheckoutError(message,503);};
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const states=new Set(['starting','pending','authorized','captured','failed','cancelled']);
const outcomes=new Set(['applied','stale','review_required']);
function snapshot(value,target){
 try{
  if(!value||value.orderId!==orderId(target)||!['pending','confirmed','processing','fulfilled','cancelled','refunded'].includes(value.orderStatus)||!Number.isSafeInteger(value.amountMinor)||value.amountMinor<=0||value.currencyCode!=='INR'||!Number.isFinite(Date.parse(value.expiresAt)))throw Error();
  orderId(value.customerId);
  if(value.attempt){const a=value.attempt;orderId(a.id);orderId(a.paymentId);if(!/^[a-z][a-z0-9_-]{1,31}$/.test(a.provider)||!(a.reference===null||reference(a.reference))||!states.has(a.status)||typeof a.needsReview!=='boolean')throw Error();}
  else if(value.attempt!==null)throw Error();
  return value;
 }catch{fail('Checkout lifecycle response needs reconciliation.');}
}
/** Server-only sandbox adapter. No credentials, public webhook, job registration,
 * default TTL, provider cancellation, live payment or automatic retry is supplied.
 * getVerifiedStatus must independently authenticate/verify the provider response;
 * browser payloads are never accepted as payment proof.
 */
export function createCheckoutLifecycleWorker({approved=false,client,provider,reservationTtlSeconds,timeoutMs=10000,now=()=>Date.now()}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||approved!==true||!client?.rpc||provider?.mode!=='sandbox'||!/^[a-z][a-z0-9_-]{1,31}$/.test(provider.name)||typeof provider.create!=='function'||typeof provider.getVerifiedStatus!=='function'||!Number.isInteger(reservationTtlSeconds)||reservationTtlSeconds<60||reservationTtlSeconds>86400)fail('Explicit sandbox lifecycle approval, provider and reservation policy are required.');
 const invoke=async(name,args)=>{let result;try{result=await client.rpc(name,args);}catch{fail('Lifecycle operation is unconfirmed. Reconcile before trying again.');}if(result?.error)fail('Lifecycle operation is unavailable or unconfirmed. Reconcile before trying again.');return result.data;};
 const get=async target=>snapshot(await invoke('get_checkout_lifecycle',{p_order_id:orderId(target)}),target);
 async function prepare({orderId:target,amountMinor,currencyCode}){
  const id=orderId(target);if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||currencyCode!=='INR')fail('Invalid payment amount.');
  let current=snapshot(await invoke('enroll_checkout_lifecycle',{p_order_id:id,p_ttl_seconds:reservationTtlSeconds}),id);
  if(current.amountMinor!==amountMinor||currencyCode!=='INR'||current.orderStatus!=='pending')fail('Payment amount or checkout state changed.');
  current=snapshot(await invoke('begin_checkout_payment_attempt',{p_order_id:id,p_provider:provider.name}),id);
  const attempt=current.attempt;if(!attempt||attempt.provider!==provider.name||attempt.needsReview||!['starting','pending'].includes(attempt.status))fail('Payment attempt needs reconciliation.');
  if(attempt.reference)return{reference:attempt.reference};
  // Registration commits before the external call. If the call/ack is lost,
  // 'starting' blocks expiry; an explicit retry uses this same idempotency key.
  let created;try{created=await withProviderDeadline(signal=>provider.create({orderId:id,attemptId:attempt.id,amountMinor:current.amountMinor,currencyCode:'INR',idempotencyKey:attempt.id,signal}),timeoutMs);}catch{fail('Sandbox payment creation is unconfirmed. Reconcile before trying again.');}
  if(!created||!reference(created.reference))fail('Sandbox payment reference is unconfirmed.');
  const bound=snapshot(await invoke('bind_checkout_payment_reference',{p_attempt_id:attempt.id,p_reference:created.reference}),id);
  if(bound.attempt?.id!==attempt.id||bound.attempt.reference!==created.reference||bound.attempt.provider!==provider.name)fail('Payment binding needs reconciliation.');
  return{reference:created.reference};
 }
 async function reconcile(target){
  const current=await get(target),attempt=current.attempt;
  if(!attempt)return{orderId:current.orderId,outcome:'no_attempt'};
  if(attempt.provider!==provider.name||!attempt.reference)return{orderId:current.orderId,outcome:'blocked_payment'};
  let proof;try{proof=await withProviderDeadline(signal=>provider.getVerifiedStatus({orderId:current.orderId,attemptId:attempt.id,reference:attempt.reference,signal}),timeoutMs);}catch{fail('Verified provider status is unavailable. Stock must remain protected.');}
  if(proof?.verified!==true||proof.mode!=='sandbox'||proof.orderId!==current.orderId||proof.attemptId!==attempt.id||proof.reference!==attempt.reference||!reference(proof.eventId)||!['pending','authorized','captured','failed','cancelled'].includes(proof.status)||!Number.isSafeInteger(proof.amountMinor)||proof.amountMinor<0||!/^[A-Z]{3}$/.test(proof.currencyCode)||!Number.isFinite(Date.parse(proof.observedAt))||Date.parse(proof.observedAt)>now()+60000)fail('Provider payment evidence could not be verified.');
  // Amount/currency mismatches are retained by SQL for manual review, never used
  // to confirm an order. Even late captures remain durable reconciliation evidence.
  const result=await invoke('reconcile_checkout_payment',{p_attempt_id:attempt.id,p_event_id:proof.eventId,p_reference:proof.reference,p_status:proof.status,p_amount_minor:proof.amountMinor,p_currency_code:proof.currencyCode,p_observed_at:proof.observedAt});
  if(result?.orderId!==current.orderId||!outcomes.has(result.outcome)||typeof result.replayed!=='boolean')fail('Payment reconciliation result is unconfirmed.');
  return result;
 }
 async function expireDue(limit=50){
  if(!Number.isInteger(limit)||limit<1||limit>100)fail('Expiry batch limit must be from 1 to 100.');
  const due=await invoke('list_due_checkout_reservations',{p_limit:limit});
  if(!Array.isArray(due)||due.length>limit||new Set(due).size!==due.length)fail('Expiry candidate batch is invalid.');
  due.forEach(orderId);const results=[];
  for(const target of due){
   let payment;try{payment=await reconcile(target);}catch{payment={outcome:'unavailable'};}
   // SQL independently rechecks payment state under the order lock. An unknown
   // provider result cannot release a starting/pending/authorized/review attempt.
   // Recording the check also rotates blocked candidates fairly between batches.
   try{const result=await invoke('expire_checkout_reservation',{p_order_id:target});if(result?.orderId!==target||!['expired','blocked_payment','not_pending','not_due'].includes(result.outcome))throw Error();results.push({...result,reconciliation:payment.outcome});}
   catch{results.push({orderId:target,outcome:'unavailable',reconciliation:payment.outcome});}
  }
  return{scanned:due.length,results};
 }
 async function listReviews({limit=50,after=null}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)fail('Review batch limit must be from 1 to 100.');if(after!==null)orderId(after);
  const result=await invoke('list_checkout_payment_reviews',{p_limit:limit,p_after:after});
  try{
   if(!Array.isArray(result.reviews)||result.reviews.length>limit||!(result.nextAfter===null||typeof result.nextAfter==='string'))throw Error();
   if(result.nextAfter!==null)orderId(result.nextAfter);
   const seen=new Set();for(const row of result.reviews){orderId(row.attemptId);orderId(row.orderId);if(seen.has(row.attemptId)||!reference(row.reference)||!/^[a-z][a-z0-9_-]{1,31}$/.test(row.provider)||!Number.isSafeInteger(row.expectedAmountMinor)||row.expectedAmountMinor<=0||row.currencyCode!=='INR'||!row.evidence||!['pending','confirmed','processing','fulfilled','cancelled','refunded'].includes(row.orderStatus))throw Error();seen.add(row.attemptId);}
   if(result.nextAfter!==null&&(result.nextAfter===after||!result.reviews.length||result.reviews.at(-1).attemptId!==result.nextAfter))throw Error();
   return result;
  }catch{fail('Payment review queue needs reconciliation.');}
 }
 return{listReviews,payments:{mode:'sandbox',prepare},reconcile,expireDue};
}
