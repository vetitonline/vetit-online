import { readJsonBody } from '../api/json-body.js';
import { isSameOriginMutation } from '../api/request-security.js';
import { BuyerOrderError,orderId } from './order-contract.js';
import { cancelPostgresOrder } from '../commerce/postgres-order-repository.server.js';
/** Uses only the verified customer's scoped client and the existing atomic RPC. */
export function createBuyerOrderCancelHandler({authenticate}){
  const json=(body,status=200)=>Response.json({apiVersion:1,...body},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return async({request,cookies})=>{
    try{
      if(request.method!=='POST')return json({state:'method_not_allowed'},405);
      if(!isSameOriginMutation(request))return json({state:'forbidden'},403);
      const auth=await authenticate(request,cookies);
      if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      if(request.headers.get('x-vetit-profile-id')!==auth.user.id)return json({state:'session_changed'},409);
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({state:'invalid_request'},415);
      const body=await readJsonBody(request,1024);if(!body.ok)return json({state:'invalid_request'},body.status);
      const id=orderId(body.value?.orderId);
      const {data,error}=await auth.supabase.from('orders').select('id,order_status').eq('customer_profile_id',auth.user.id).eq('id',id).maybeSingle();
      if(error)return json({state:'unavailable'},503);
      if(!data)return json({state:'not_found'},404);
      if(!['pending','cancelled'].includes(data.order_status))return json({state:'conflict'},409);
      const order=await cancelPostgresOrder(auth.supabase,{orderId:id,customerId:auth.user.id});
      return json({state:'cancelled',profileId:auth.user.id,order});
    }catch(error){
      const status=error instanceof BuyerOrderError?error.status:[403,409].includes(error?.status)?error.status:503;
      return json({state:status===503?'unavailable':status===403?'forbidden':status===409?'conflict':'invalid_request'},status);
    }
  };
}
