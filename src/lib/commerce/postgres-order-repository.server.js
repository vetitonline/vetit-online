import { normalizeCheckout, CheckoutError } from './checkout-service.js';
import { normalizeOrderSummary, orderId } from '../buyer/order-contract.js';

const disabled=()=>{throw new CheckoutError('Database checkout requires explicit server approval.',503);};
const expectedAmount=value=>{if(!Number.isSafeInteger(value)||value<0)throw new CheckoutError('Checkout total is invalid.');return value;};
const failure=error=>new CheckoutError('Order state could not be confirmed. Keep the same checkout reference and reconcile before retrying.',error?.code==='42501'?403:['22023','23514','40001','40P01'].includes(error?.code)?409:503);
function ownedOrder(data,customerId,expectedTotal){
  const order=normalizeOrderSummary(data);
  if(data.customer_profile_id!==orderId(customerId)||order.total_minor!==expectedAmount(expectedTotal))throw new CheckoutError('Order response needs reconciliation.',503);
  return {...order,customer_profile_id:data.customer_profile_id};
}

/** Server-only. Explicit approval is a dependency-injection option, never request data.
 * The default runtime does not instantiate this repository or a privileged worker. */
export function createPostgresOrderRepository(client,{approved=false,quoteId}={}){
  if(approved!==true)disabled();
  const quote=orderId(quoteId);
  const invoke=async(name,input)=>{
    const request=normalizeCheckout(input.request??input);
    const {data,error}=await client.rpc(name,{p_quote_id:quote,p_idempotency_key:orderId(input.idempotencyKey),p_expected_total:expectedAmount(input.expectedTotalMinor),p_request:request});
    if(error)throw failure(error);
    return data===null?null:ownedOrder(data,input.customerId,input.expectedTotalMinor);
  };
  return{
    atomic:true,
    findExistingOrder:input=>invoke('get_my_checkout_order',input),
    async createPendingOrder(input){
      const result=await invoke('place_my_order',input);
      if(!result||result.subtotal_minor!==input.expectedSubtotalMinor||result.delivery_minor!==input.shippingQuote.amountMinor||result.tax_minor!==input.taxMinor)throw new CheckoutError('Order response needs reconciliation.',503);
      return result;
    },
    async cancelOrder({orderId:target,customerId}){
      const id=orderId(target);const {data,error}=await client.rpc('cancel_my_checkout_order',{p_order_id:id});
      if(error)throw failure(error);
      const order=normalizeOrderSummary(data);
      if(data.customer_profile_id!==orderId(customerId)||order.id!==id||order.order_status!=='cancelled')throw new CheckoutError('Cancellation needs reconciliation.',503);
      return order;
    },
  };
}

/** Trusted shipping/tax worker only. SQL independently resolves every product price.
 * The publishable-key client cannot execute this RPC, even if approval is supplied. */
export async function issuePostgresCheckoutQuote(workerClient,input,{approved=false,customerId,deliveryMinor,taxMinor,rateReference,ttlSeconds=300}={}){
  if(approved!==true)disabled();
  const {data,error}=await workerClient.rpc('issue_checkout_quote',{p_customer_id:orderId(customerId),p_request:normalizeCheckout(input),p_delivery_minor:expectedAmount(deliveryMinor),p_tax_minor:expectedAmount(taxMinor),p_rate_reference:rateReference,p_ttl_seconds:ttlSeconds});
  if(error)throw new CheckoutError('Trusted checkout quote is unavailable.',503);
  if(!data||data.id!==orderId(data.id)||data.currencyCode!=='INR'||data.deliveryMinor!==deliveryMinor||data.taxMinor!==taxMinor||!Number.isSafeInteger(data.subtotalMinor)||data.subtotalMinor<=0||data.totalMinor!==data.subtotalMinor+deliveryMinor+taxMinor||!Number.isSafeInteger(data.totalMinor)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())throw new CheckoutError('Trusted checkout quote is invalid.',503);
  return data;
}
