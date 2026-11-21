import {randomUUID} from 'node:crypto';
import {CheckoutError,normalizeCheckout} from './checkout-service.js';
import {orderId} from '../buyer/order-contract.js';
const fail=()=>{throw new CheckoutError('Sandbox shipping/tax configuration or coverage is unavailable.',503);};
/** Explicit synthetic rate configuration. Never a live carrier or statutory tax
 * calculator. No default rates, credentials, environment reads or registration. */
export function createSandboxChargeProviders({approved=false,policy,now=()=>Date.now()}={}) {
 if(approved!==true||!policy||typeof policy.reference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(policy.reference)||!Number.isSafeInteger(policy.deliveryPerSellerMinor)||policy.deliveryPerSellerMinor<0||!Number.isInteger(policy.taxBasisPoints)||policy.taxBasisPoints<0||policy.taxBasisPoints>10000||typeof policy.taxShipping!=='boolean'||!Number.isInteger(policy.quoteTtlSeconds)||policy.quoteTtlSeconds<31||policy.quoteTtlSeconds>900||!Array.isArray(policy.postalPrefixes)||!policy.postalPrefixes.length||policy.postalPrefixes.length>100||policy.postalPrefixes.some(prefix=>typeof prefix!=='string'||! /^[1-9][0-9]{2,5}$/.test(prefix))||new Set(policy.postalPrefixes).size!==policy.postalPrefixes.length)fail();
 const config=structuredClone(policy);
 const money=value=>{if(!Number.isSafeInteger(value)||value<0)fail();return BigInt(value);};
 const amount=value=>{if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))fail();return Number(value);};
 function basis(context){
  try{
   orderId(context.customerId);const request=normalizeCheckout(context.request);
   if(context.currencyCode!=='INR'||!config.postalPrefixes.some(prefix=>request.deliveryAddress.postalCode.startsWith(prefix))||!Array.isArray(context.items)||context.items.length!==request.lines.length)fail();
   const expected=new Map(request.lines.map(line=>[line.listingId+':'+(line.productVariantId??''),line.quantity])),seen=new Set(),sellers=new Set();let subtotal=0n;
   for(const item of context.items){const key=orderId(item.listingId)+':'+orderId(item.productVariantId);if(seen.has(key)||expected.get(key)!==item.quantity||item.unitPriceMinor<=0)fail();seen.add(key);sellers.add(orderId(item.businessId));subtotal+=money(item.unitPriceMinor)*BigInt(item.quantity);}
   if(subtotal!==money(context.subtotalMinor))fail();
   return {subtotal,sellers:sellers.size};
  }catch{fail();}
 }
 function quote(kind,value){const instant=now();if(!Number.isSafeInteger(instant)||instant<0||!Number.isSafeInteger(instant+config.quoteTtlSeconds*1000))fail();return{id:`sandbox-${kind}-${config.reference}-${randomUUID()}`,currencyCode:'INR',amountMinor:amount(value),expiresAt:(()=>{const expires=new Date(instant+config.quoteTtlSeconds*1000);if(!Number.isFinite(expires.getTime()))fail();return expires.toISOString();})()};}
 return {
  shipping:{mode:'sandbox',quote:async context=>{const {sellers}=basis(context);return quote('shipping',BigInt(config.deliveryPerSellerMinor)*BigInt(sellers));}},
  taxes:{mode:'sandbox',quote:async context=>{const {subtotal,sellers}=basis(context);if(context.shipping?.currencyCode!=='INR'||money(context.shipping.amountMinor)!==BigInt(config.deliveryPerSellerMinor)*BigInt(sellers))fail();const taxable=subtotal+(config.taxShipping?money(context.shipping.amountMinor):0n);return quote('tax',(taxable*BigInt(config.taxBasisPoints)+5000n)/10000n);}},
 };
}
