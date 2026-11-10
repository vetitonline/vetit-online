import {withProviderDeadline} from './provider-deadline.server.js';
import {normalizeCheckout,CheckoutError} from './checkout-service.js';
import {orderId} from '../buyer/order-contract.js';
const fail=()=>{throw new CheckoutError('Trusted shipping/tax quote is unavailable or changed. Review checkout again.',503);};
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
/** Dependency-injected sandbox only. No default rates or provider credentials.
 * Bind the independently verified customer ID at the eventual server boundary.
 */
export function createCheckoutRateIssuer({approved=false,client,shipping,taxes,ttlSeconds=300,reservationTtlSeconds,timeoutMs=10000,now=()=>Date.now()}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isInteger(reservationTtlSeconds)||reservationTtlSeconds<60||reservationTtlSeconds>86400||approved!==true||!client?.rpc||shipping?.mode!=='sandbox'||taxes?.mode!=='sandbox'||typeof shipping.quote!=='function'||typeof taxes.quote!=='function'||!Number.isInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>900)fail();
 const invoke=async(name,args)=>{try{const result=await client.rpc(name,args);if(result.error)fail();return result.data;}catch{fail();}};
 const charge=value=>{if(!value||!ref(value.id)||value.currencyCode!=='INR'||!Number.isSafeInteger(value.amountMinor)||value.amountMinor<0||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now()+30000)fail();return{id:value.id,currencyCode:'INR',amountMinor:value.amountMinor,expiresAt:value.expiresAt};};
 async function issue(input,customerId){
  const owner=orderId(customerId),request=normalizeCheckout(input);
  const basis=await invoke('get_checkout_rate_basis',{p_request:request});
  if(!Array.isArray(basis?.items)||basis.items.length!==request.lines.length||basis.items.length>50)fail();
  const key=line=>line.listingId+':'+(line.productVariantId??'');const expected=new Map(request.lines.map(line=>[key(line),line.quantity])),seen=new Set();let subtotal=0;
  const items=basis.items.map(item=>{
   try{orderId(item.listingId);orderId(item.productVariantId);orderId(item.businessId);}catch{fail();}
   if(expected.get(key(item))!==item.quantity||seen.has(key(item))||!Number.isSafeInteger(item.unitPriceMinor)||item.unitPriceMinor<=0||typeof item.title!=='string'||typeof item.sellerSku!=='string'||!item.optionAttributes||typeof item.optionAttributes!=='object'||Array.isArray(item.optionAttributes))fail();
   seen.add(key(item));subtotal+=item.quantity*item.unitPriceMinor;if(!Number.isSafeInteger(subtotal))fail();return structuredClone(item);
  });
  const context={customerId:owner,request,items,subtotalMinor:subtotal,currencyCode:'INR'};
  let delivery,tax;try{delivery=charge(await withProviderDeadline(signal=>shipping.quote({...structuredClone(context),signal}),timeoutMs));tax=charge(await withProviderDeadline(signal=>taxes.quote({...structuredClone(context),shipping:structuredClone(delivery),signal}),timeoutMs));}catch{fail();}
  const validUntil=new Date(Math.min(Date.parse(delivery.expiresAt),Date.parse(tax.expiresAt))).toISOString();
  if(Date.parse(validUntil)<=now()+30000)fail();
  const result=await invoke('issue_checkout_rated_quote',{p_customer_id:owner,p_request:request,p_expected_items:items,p_delivery_minor:delivery.amountMinor,p_tax_minor:tax.amountMinor,p_shipping_reference:delivery.id,p_tax_reference:tax.id,p_valid_until:validUntil,p_ttl_seconds:ttlSeconds,p_reservation_ttl_seconds:reservationTtlSeconds});
  try{orderId(result.id);}catch{fail();}
  if(result.currencyCode!=='INR'||result.subtotalMinor!==subtotal||result.deliveryMinor!==delivery.amountMinor||result.taxMinor!==tax.amountMinor||result.totalMinor!==subtotal+delivery.amountMinor+tax.amountMinor||!Number.isSafeInteger(result.totalMinor)||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)>Date.parse(validUntil)||Date.parse(result.expiresAt)<=now())fail();
  return result;
 }
 return{issue};
}
