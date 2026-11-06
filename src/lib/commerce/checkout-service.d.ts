import type { QuoteRequestLine, CheckoutQuote, calculateCheckoutQuote } from './checkout-quote.js';
import type { OrderSummary } from '../buyer/order-contract.js';
export type DeliveryAddress = {recipientName:string;phone:string|null;addressLine1:string;addressLine2:string|null;locality:string|null;city:string;stateRegion:string|null;postalCode:string|null;countryCode:string};
export type NormalizedCheckout = {lines:QuoteRequestLine[];customer:{email:string;name:string};deliveryAddress:DeliveryAddress};
export type ShippingQuote = {id:string;currencyCode:'INR';amountMinor:number;expiresAt:string};
type Products=Parameters<typeof calculateCheckoutQuote>[1];
export type ReviewDependencies = {loadProducts:(lines:QuoteRequestLine[])=>Promise<Products>;shipping?:{quote:(input:{lines:QuoteRequestLine[];products:Products;address:DeliveryAddress;currencyCode:'INR'})=>Promise<ShippingQuote|null>};taxes?:{quote:(input:{lines:CheckoutQuote['lines'];address:DeliveryAddress;currencyCode:'INR'})=>Promise<{currencyCode:'INR';amountMinor:number}|null>};now?:()=>number};
export type CheckoutReview=NormalizedCheckout & {apiVersion:1;state:'review_only';summary:CheckoutQuote;shipping:ShippingQuote|null;taxMinor:number|null;totalMinor:number|null;currencyCode:'INR';checkoutEnabled:false;payment:{state:'disabled'};blockers:string[]};
export type AtomicOrderCommand=NormalizedCheckout & {customerId:string;idempotencyKey:string;shippingQuote:ShippingQuote;taxMinor:number;expectedSubtotalMinor:number;expectedTotalMinor:number;currencyCode:'INR'};
export type ExistingOrderCommand={customerId:string;idempotencyKey:string;expectedTotalMinor:number;request:NormalizedCheckout};
export type OrderDependencies=ReviewDependencies & {repository?:{atomic:boolean;findExistingOrder?:(input:ExistingOrderCommand)=>Promise<(OrderSummary&{customer_profile_id:string})|null>;createPendingOrder:(input:AtomicOrderCommand)=>Promise<OrderSummary&{customer_profile_id:string}>};payments?:{mode:'sandbox';prepare:(input:{orderId:string;amountMinor:number;currencyCode:'INR';idempotencyKey:string})=>Promise<{reference:string}>}};
export class CheckoutError extends Error { status:number; constructor(message:string,status?:number); }
export function normalizeCheckout(input:unknown): NormalizedCheckout;
export function reviewCheckout(input:unknown, dependencies:ReviewDependencies):Promise<CheckoutReview>;
export function createCheckoutOrder(input:unknown, customerId:string, dependencies:OrderDependencies):Promise<{apiVersion:1;state:'created'|'existing';order:OrderSummary;payment:{state:'disabled'|'unavailable'|'sandbox';reference?:string}}>;
export function transitionReturn(input:{state:string;action:string;role:string;deliveredAt:string;returnWindowDays:number;now?:number}):string;
