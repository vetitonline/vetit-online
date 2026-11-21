import {BuyerOrderError,normalizeOrderHistoryQuery,normalizeOrderSummary,encodeOrderCursor} from '../buyer/order-contract.js';
/** Trusted claim and database permission must both pass. No service-role client. */
export function createAdminOrdersHandler({authenticate}) {
  const json=(body,status=200)=>new Response(JSON.stringify({apiVersion:1,...body}),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie, Authorization'}});
  return async({request,cookies})=>{
    try {
      if(request.method!=='GET')return json({state:'method_not_allowed'},405);
      const auth=await authenticate(request,cookies);
      if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      if(![true,'true'].includes(auth.user.app_metadata?.vetit_admin))return json({state:'forbidden'},403);
      const query=normalizeOrderHistoryQuery(new URL(request.url).searchParams);
      if('orderId' in query)return json({state:'invalid_request'},400);
      const result=await auth.supabase.rpc('get_admin_order_overview',{p_limit:query.limit+1,p_before_created_at:query.cursor?.createdAt??null,p_before_id:query.cursor?.id??null});
      if(result.error){if(result.error.code==='42501')return json({state:'forbidden'},403);throw Error();}
      if(!Array.isArray(result.data)||result.data.length>query.limit+1)throw Error();
      const rows=result.data.map(normalizeOrderSummary);
      if(new Set(rows.map(row=>row.id.toLowerCase())).size!==rows.length)throw Error();
      const orders=rows.slice(0,query.limit);
      return json({state:'available',orders,nextCursor:rows.length>query.limit?encodeOrderCursor(orders.at(-1)):null});
    } catch(error) {
      if(error instanceof BuyerOrderError&&error.status===400)return json({state:'invalid_request'},400);
      return json({state:'unavailable',message:'Admin order overview is unavailable. The approved read-only backend may not be installed.'},503);
    }
  };
}
