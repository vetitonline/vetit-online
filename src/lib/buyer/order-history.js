import {BuyerOrderError,normalizeOrderHistoryQuery,normalizeOrderSummary,normalizeOrderItem,normalizeOrderFulfilment,encodeOrderCursor} from './order-contract.js';
const fields='id,market_code,order_status,currency_code,subtotal_minor,delivery_minor,tax_minor,total_minor,created_at';
const json=(body,status=200)=>new Response(JSON.stringify({apiVersion:1,...body}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
/** Read-only, verified-customer-scoped queries. No service key or proposed RPC. */
export function createBuyerOrderHistoryHandler({authenticate}){
  return async({request,cookies,url})=>{
    try{
      const auth=await authenticate(request,cookies);
      if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      const input=normalizeOrderHistoryQuery(url.searchParams);
      let query=auth.supabase.from('orders').select(fields).eq('customer_profile_id',auth.user.id);
      if(input.orderId){
        const result=await query.eq('id',input.orderId).maybeSingle();
        if(result.error)throw Error();if(!result.data)return json({state:'not_found'},404);
        const order=normalizeOrderSummary(result.data);
        // RLS remains active. Children are loaded only after parent ownership.
        const items=await auth.supabase.from('order_items').select('id,listing_id,business_id,product_variant_id,title_snapshot,quantity,unit_price_minor,currency_code').eq('order_id',order.id).order('id').limit(101);
        const fulfilments=await auth.supabase.from('fulfilments').select('id,business_id,status,carrier,tracking_reference,shipped_at,delivered_at').eq('order_id',order.id).order('id').limit(101);
        if(items.error||fulfilments.error||!Array.isArray(items.data)||!Array.isArray(fulfilments.data))throw Error();
        return json({state:'available',order,items:items.data.slice(0,100).map(row=>normalizeOrderItem(row,order.currency_code)),fulfilments:fulfilments.data.slice(0,100).map(normalizeOrderFulfilment),truncated:items.data.length>100||fulfilments.data.length>100});
      }
      if(input.cursor)query=query.or(`created_at.lt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.lt.${input.cursor.id})`);
      const result=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(input.limit+1);
      if(result.error||!Array.isArray(result.data))throw Error();
      const orders=result.data.slice(0,input.limit).map(normalizeOrderSummary);
      return json({state:'available',orders,nextCursor:result.data.length>input.limit?encodeOrderCursor(orders.at(-1)):null});
    }catch(error){
      if(error instanceof BuyerOrderError&&error.status===400)return json({state:'invalid_request',message:error.message},400);
      return json({state:'unavailable',message:'Order history is temporarily unavailable.'},503);
    }
  };
}
