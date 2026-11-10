import { normalizeOrderItem, normalizeOrderFulfilment, orderId } from '../buyer/order-contract.js';
import { normalizeFulfilmentTransitionInput, BuyerInputError } from '../buyer/validation.js';
import { isSameOriginMutation } from '../api/request-security.js';
import {parseSellerOrderPage,sellerOrderScope,applySellerOrderPosition,sellerOrderStream,encodeSellerOrderPage,SellerPaginationError} from './order-pagination.js';
import { readJsonBody } from '../api/json-body.js';
export const fulfilmentActions = status => ({pending:['packed','cancelled'],packed:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]}[status] ?? []);
export function createSellerOrdersHandler({authenticate,rpc}) {
  const json=(body,status=200)=>new Response(JSON.stringify({apiVersion:1,...body}),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  const complete=result=>{if(result.error||!Array.isArray(result.data)||result.count!==result.data.length||result.data.length>200)throw Error();return result.data;};
  return async ({request,cookies})=>{
    try{
      if(!['GET','POST'].includes(request.method))return json({state:'method_not_allowed'},405);
      if(request.method==='POST'&&!isSameOriginMutation(request))return json({state:'forbidden'},403);
      const auth=await authenticate(request,cookies);
      if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      if(request.method==='POST'&&request.headers.get('x-vetit-profile-id')!==auth.user.id)return json({state:'session_changed'},409);
      const page=request.method==='GET'?parseSellerOrderPage(new URL(request.url),auth.user.id):null;
      if(request.method==='GET'&&request.headers.has('x-vetit-profile-id')&&request.headers.get('x-vetit-profile-id')!==auth.user.id)return json({state:'session_changed'},409);
      const memberships=complete(await auth.supabase.from('business_memberships').select('business_id,member_role',{count:'exact'}).eq('profile_id',auth.user.id).eq('membership_status','active').in('member_role',['owner','admin','fulfillment_manager']).limit(201));
      let ids=[...new Set(memberships.map(row=>orderId(row.business_id)))];
      if(ids.length)ids=complete(await auth.supabase.from('businesses').select('id',{count:'exact'}).in('id',ids).eq('is_active',true).is('archived_at',null).limit(201)).map(row=>orderId(row.id));
      if(request.method==='POST'){
        if(!ids.length)return json({state:'forbidden'},403);
        if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({state:'invalid_request'},415);
        const body=await readJsonBody(request,2048);if(!body.ok)return json({state:'invalid_request'},body.status);
        const input=normalizeFulfilmentTransitionInput(body.value);
        const own=await auth.supabase.from('fulfilments').select('id,business_id,status').eq('id',input.fulfilmentId).in('business_id',ids).maybeSingle();
        if(own.error)throw Error();if(!own.data)return json({state:'not_found'},404);
        if(!fulfilmentActions(own.data.status).includes(input.nextStatus))return json({state:'invalid_transition'},409);
        const result=await rpc(auth.supabase,'advance_seller_fulfilment',{p_fulfilment_id:input.fulfilmentId,p_next_status:input.nextStatus,p_carrier:input.carrier,p_tracking_reference:input.trackingReference});
        if(result.error)throw Error();if(result.data!==input.fulfilmentId)throw Error();
        return json({state:'updated',fulfilmentId:result.data});
      }
      if(page){
        const scope=await sellerOrderScope(ids);
        const mapItem=row=>{if(!ids.includes(row.business_id)||!/^[A-Z]{3}$/.test(row.currency_code))throw Error();return{...normalizeOrderItem(row,row.currency_code),orderId:orderId(row.order_id)};};
        const mapShipment=row=>{if(!ids.includes(row.business_id))throw Error();return{...normalizeOrderFulfilment(row),orderId:orderId(row.order_id)};};
        if(page.fulfilmentId){
          if(!ids.length)return json({state:'not_found'},404);
          const result=await auth.supabase.from('fulfilments').select('id,order_id,business_id,status,carrier,tracking_reference,shipped_at,delivered_at').eq('id',page.fulfilmentId).in('business_id',ids).maybeSingle();
          if(result.error)throw Error();if(!result.data)return json({state:'not_found'},404);
          return json({state:'available',profileId:auth.user.id,scope,fulfilment:mapShipment(result.data)});
        }
        if(page.cursor&&page.cursor.scope!==scope)throw new SellerPaginationError(409);
        const select=async(table,columns,key)=>{
          if(!ids.length||page.cursor?.[key].done)return{data:[]};
          const query=auth.supabase.from(table).select(columns+',created_at').in('business_id',ids).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(page.limit+1);
          return await applySellerOrderPosition(query,page.cursor?.[key]);
        };
        const [itemResult,shipmentResult]=await Promise.all([
          select('order_items','id,order_id,listing_id,business_id,product_variant_id,title_snapshot,quantity,unit_price_minor,currency_code','items'),
          select('fulfilments','id,order_id,business_id,status,carrier,tracking_reference,shipped_at,delivered_at','fulfilments')
        ]);
        const items=sellerOrderStream(itemResult,page.limit,page.cursor?.items),fulfilments=sellerOrderStream(shipmentResult,page.limit,page.cursor?.fulfilments);
        const nextCursor=encodeSellerOrderPage({profileId:auth.user.id,scope,limit:page.limit,items:items.cursor,fulfilments:fulfilments.cursor});
        return json({state:'available',profileId:auth.user.id,items:items.rows.map(mapItem),fulfilments:fulfilments.rows.map(mapShipment),pagination:{scope,limit:page.limit,nextCursor}});
      }
      if(!ids.length)return json({state:'available',profileId:auth.user.id,items:[],fulfilments:[]});
      const [items,fulfilments]=await Promise.all([
        auth.supabase.from('order_items').select('id,order_id,listing_id,business_id,product_variant_id,title_snapshot,quantity,unit_price_minor,currency_code',{count:'exact'}).in('business_id',ids).order('created_at',{ascending:false}).limit(201),
        auth.supabase.from('fulfilments').select('id,order_id,business_id,status,carrier,tracking_reference,shipped_at,delivered_at',{count:'exact'}).in('business_id',ids).order('created_at',{ascending:false}).limit(201),
      ]);
      return json({state:'available',profileId:auth.user.id,
        items:complete(items).map(row=>{if(!ids.includes(row.business_id)||!/^[A-Z]{3}$/.test(row.currency_code))throw Error();return{...normalizeOrderItem(row,row.currency_code),orderId:orderId(row.order_id)};}),
        fulfilments:complete(fulfilments).map(row=>{if(!ids.includes(row.business_id))throw Error();return{...normalizeOrderFulfilment(row),orderId:orderId(row.order_id)};}),
      });
    }catch(error){if(error instanceof SellerPaginationError)return json({state:error.status===409?'session_changed':'invalid_request',message:error.message},error.status);return json({state:'unavailable',message:error instanceof BuyerInputError?'Review the fulfilment details.':'Seller orders are unavailable. Reload to reconcile before trying again.'},error instanceof BuyerInputError?400:503);}
  };
}
