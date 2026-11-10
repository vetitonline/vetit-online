import { BuyerOrderError,orderId,normalizeOrderSummary } from './order-contract.js';
/** Cookie-backed web and bearer-backed mobile callers share this mutation. No retries. */
export async function requestBuyerOrderCancellation({orderId:target,profileId,baseUrl=globalThis.location?.origin,accessToken,signal,fetchImpl=fetch}){
  const id=orderId(target),owner=orderId(profileId);
  let origin;try{origin=new URL(baseUrl);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();if(accessToken!==undefined&&(typeof accessToken!=='string'||accessToken.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)))throw Error();}catch{throw new BuyerOrderError('Order API configuration is invalid.');}
  let response;try{
    response=await fetchImpl(new URL('/api/buyer/orders/cancel',origin),{method:'POST',credentials:accessToken?'omit':'same-origin',cache:'no-store',redirect:'error',signal,headers:{accept:'application/json','content-type':'application/json','x-vetit-profile-id':owner,...(accessToken?{authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify({orderId:id})});
  }catch{throw new BuyerOrderError('Cancellation could not be confirmed. Reload the order before trying again.',0);}
  if(!response.ok)throw new BuyerOrderError(response.status===401?'Sign in and reload this order.':response.status===409?'Your account or order changed. Reload before trying again.':response.status===403?'This order cannot be cancelled by this account. Reload to check its status.':response.status===404?'Order not found for this account.':'Cancellation is unavailable or unconfirmed. Reload the order before trying again.',response.status);
  try{const body=await response.json(),order=normalizeOrderSummary(body.order);if(body.apiVersion!==1||body.state!=='cancelled'||body.profileId!==owner||order.id!==id||order.order_status!=='cancelled')throw Error();return{apiVersion:1,state:'cancelled',profileId:owner,order};}
  catch{throw new BuyerOrderError('Cancellation needs reconciliation. Reload the order before trying again.',503);}
}
