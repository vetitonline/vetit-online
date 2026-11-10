import { normalizeQuoteLines, calculateCheckoutQuote } from './checkout-quote.js';
import { normalizeAddressInput } from '../buyer/validation.js';
import { normalizeOrderSummary, orderId } from '../buyer/order-contract.js';

export class CheckoutError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function normalizeDeliveryAddress(input) {
  const address = normalizeAddressInput(input);
  if (Object.values(address).some(value => typeof value === 'string' && /[\u0000-\u001f\u007f]/.test(value))) throw new CheckoutError('Delivery details contain unsupported characters.');
  if (address.countryCode !== 'IN' || !/^[1-9]\d{5}$/.test(address.postalCode ?? '') || !address.stateRegion || !/^(?:\+91)?[6-9]\d{9}$/.test((address.phone ?? '').replace(/[\s()-]/g,''))) throw new CheckoutError('An Indian delivery address, state, six-digit PIN and mobile number are required.');
  // Copy only delivery fields; IDs, geolocation, default flags and claimed totals are not authority.
  return {
    recipientName:address.recipientName,phone:address.phone,addressLine1:address.addressLine1,addressLine2:address.addressLine2,locality:address.locality,city:address.city,stateRegion:address.stateRegion,postalCode:address.postalCode,countryCode:'IN',
  };
}
export function normalizeCheckout(input) {
  const lines = normalizeQuoteLines(input);
  const customer = input?.customer;
  if (!customer || typeof customer.email !== 'string' || customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) throw new CheckoutError('Enter a valid contact email.');
  const deliveryAddress=normalizeDeliveryAddress(input.deliveryAddress);
  return {lines,customer:{email:customer.email.trim().toLowerCase(),name:deliveryAddress.recipientName},deliveryAddress};
}

/** Shipping and tax adapters return trusted server quotes, never browser-supplied charges. */
export async function reviewCheckout(input, { loadProducts, shipping, taxes, now = () => Date.now() }) {
  const normalized = normalizeCheckout(input);
  const products = await loadProducts(normalized.lines);
  const quote = calculateCheckoutQuote(normalized.lines, products);
  const shippingQuote = shipping ? await shipping.quote({ lines:normalized.lines,products,address:normalized.deliveryAddress,currencyCode:'INR' }) : null;
  const taxQuote = taxes ? await taxes.quote({ lines:quote.lines,address:normalized.deliveryAddress,currencyCode:'INR' }) : null;
  const validMoney = amount => Number.isSafeInteger(amount) && amount >= 0;
  if (shippingQuote && (typeof shippingQuote.id !== 'string' || !shippingQuote.id || shippingQuote.currencyCode !== 'INR' || !validMoney(shippingQuote.amountMinor) || !Number.isFinite(Date.parse(shippingQuote.expiresAt)) || Date.parse(shippingQuote.expiresAt) <= now())) throw new CheckoutError('Shipping quote is invalid or expired.', 503);
  if (taxQuote && (taxQuote.currencyCode !== 'INR' || !validMoney(taxQuote.amountMinor))) throw new CheckoutError('Tax quote is unavailable.', 503);
  const total = shippingQuote && taxQuote ? quote.subtotalMinor + shippingQuote.amountMinor + taxQuote.amountMinor : null;
  if (total !== null && !Number.isSafeInteger(total)) throw new CheckoutError('Checkout amount is outside the supported range.');
  return { apiVersion:1,state:'review_only',...normalized,summary:quote,shipping:shippingQuote,taxMinor:taxQuote?.amountMinor ?? null,totalMinor:total,currencyCode:'INR',checkoutEnabled:false,payment:{state:'disabled'}, blockers:[...(!shippingQuote?['Shipping service and charges are not configured.']:[]),...(!taxQuote?['Tax calculation is not configured.']:[]),'Order placement requires the approved transactional backend.'] };
}

/** Repository MUST atomically recheck ownership, prices, stock, quote expiry and totals,
 * reserve stock, persist snapshots/items/fulfilments and deduplicate (customer,key).
 * No sequential client inserts can satisfy this interface. No hosted adapter is installed. */
export async function createCheckoutOrder(input, customerId, { repository, payments, ...reviewDependencies }) {
  if (!repository || repository.atomic !== true) throw new CheckoutError('Order placement is unavailable until the transactional backend is approved.',503);
  if (payments && payments.mode !== 'sandbox') throw new CheckoutError('Live payments are disabled.',503);
  const key = orderId(input?.idempotencyKey), owner = orderId(customerId);
  // Reconcile completed attempts before re-quoting an expired price/shipping offer.
  // The database lookup checks the same quote, canonical request, owner and total.
  if (repository.findExistingOrder) {
    const existing = await repository.findExistingOrder({customerId:owner,idempotencyKey:key,expectedTotalMinor:input.expectedTotalMinor,request:normalizeCheckout(input)});
    if (existing) {
      const order=normalizeOrderSummary(existing);
      if(existing.customer_profile_id!==owner||order.total_minor!==input.expectedTotalMinor)throw new CheckoutError('Order response needs reconciliation.',503);
      return {apiVersion:1,state:'existing',order,payment:{state:'disabled'}};
    }
  }
  const review = await reviewCheckout(input, reviewDependencies);
  if (review.totalMinor === null) throw new CheckoutError('Shipping and tax must be calculated before placing an order.',503);
  if (review.summary.lines.some(line=>line.unitAmountMinor<=0)) throw new CheckoutError('Order lines require a positive current price.',409);
  if (!Number.isSafeInteger(input.expectedTotalMinor) || input.expectedTotalMinor !== review.totalMinor) throw new CheckoutError('Prices or delivery charges changed. Review checkout again.',409);
  const persisted = await repository.createPendingOrder({ customerId:owner,idempotencyKey:key,lines:review.lines,customer:review.customer,deliveryAddress:review.deliveryAddress,shippingQuote:review.shipping,taxMinor:review.taxMinor,expectedSubtotalMinor:review.summary.subtotalMinor,expectedTotalMinor:review.totalMinor,currencyCode:'INR' });
  const order = normalizeOrderSummary(persisted);
  // The repository owns transition authority; this boundary never marks an order paid.
  if (persisted.customer_profile_id !== owner || order.order_status !== 'pending' || order.total_minor !== review.totalMinor || order.subtotal_minor !== review.summary.subtotalMinor || order.delivery_minor !== review.shipping.amountMinor || order.tax_minor !== review.taxMinor || order.currency_code !== 'INR') throw new CheckoutError('Order result needs reconciliation. Keep the same checkout reference.',503);
  let payment = { state:'disabled' };
  if (payments) {
    try { const intent = await payments.prepare({ orderId:order.id,amountMinor:order.total_minor,currencyCode:'INR',idempotencyKey:`${order.id}:${key}` }); if (typeof intent.reference !== 'string' || !intent.reference || intent.reference.length > 200) throw Error('Invalid sandbox payment reference'); payment = { state:'sandbox',reference:intent.reference }; }
    catch { payment = { state:'unavailable' }; }
  }
  return { apiVersion:1,state:'created',order,payment };
}

/** Returns end in refund_pending. A return state never performs a payment refund. */
export function transitionReturn({ state, action, role, deliveredAt, returnWindowDays, now = Date.now() }) {
  if (action === 'request') {
    if (role !== 'customer' || state !== 'none' || !Number.isInteger(returnWindowDays) || returnWindowDays < 1 || !Number.isFinite(Date.parse(deliveredAt)) || now < Date.parse(deliveredAt) || now > Date.parse(deliveredAt) + returnWindowDays * 86400000) throw new CheckoutError('This item is not eligible for a return request.',403);
    return 'requested';
  }
  if (!['owner','admin','fulfillment_manager'].includes(role)) throw new CheckoutError('Return management is not permitted.',403);
  const next = { 'requested:approve':'approved','requested:reject':'rejected','approved:receive':'received','received:review_refund':'refund_pending' }[`${state}:${action}`];
  if (!next) throw new CheckoutError('Return transition is invalid.',409);
  return next;
}
