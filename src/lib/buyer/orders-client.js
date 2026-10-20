import {BuyerOrderError,orderId,normalizeOrderHistoryQuery,normalizeOrderSummary,normalizeOrderItem,normalizeOrderFulfilment} from './order-contract.js';
export {BuyerOrderError} from './order-contract.js';
export async function requestBuyerOrders({baseUrl,orderId:detail,limit,cursor,accessToken,signal,fetchImpl=fetch}={}){
  let url;try{url=new URL(baseUrl||globalThis.location?.origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();}catch{throw new BuyerOrderError('Order API origin is invalid.');}
  url=new URL('/api/buyer/orders',url);
  if(detail!==undefined)url.searchParams.set('orderId',orderId(detail));
  if(limit!==undefined)url.searchParams.set('limit',String(limit));if(cursor!==undefined)url.searchParams.set('cursor',cursor);
  normalizeOrderHistoryQuery(url.searchParams);
  if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||/\s/.test(accessToken)))throw new BuyerOrderError('Access token is invalid.');
  let response;try{response=await fetchImpl(url.toString(),{method:'GET',credentials:accessToken?'omit':'same-origin',redirect:'error',cache:'no-store',signal,headers:{accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{})}});}catch{throw new BuyerOrderError('Order history could not be reached.',0);}
  if(!response.ok)throw new BuyerOrderError(response.status===401?'Sign in to view your orders.':response.status===404?'Order not found.':'Order history is temporarily unavailable.',response.status);
  try{
    const body=await response.json();if(!body||body.apiVersion!==1||body.state!=='available')throw Error();
    if(detail!==undefined){
      const order=normalizeOrderSummary(body.order);if(order.id!==orderId(detail)||!Array.isArray(body.items)||!Array.isArray(body.fulfilments)||body.items.length>100||body.fulfilments.length>100||typeof body.truncated!=='boolean')throw Error();
      return{apiVersion:1,state:'available',order,items:body.items.map(row=>normalizeOrderItem(row,order.currency_code)),fulfilments:body.fulfilments.map(normalizeOrderFulfilment),truncated:body.truncated};
    }
    if(!Array.isArray(body.orders)||body.orders.length>(limit??20)||!(body.nextCursor===null||typeof body.nextCursor==='string'))throw Error();
    if(body.nextCursor!==null)normalizeOrderHistoryQuery(new URLSearchParams({cursor:body.nextCursor}));
    return{apiVersion:1,state:'available',orders:body.orders.map(normalizeOrderSummary),nextCursor:body.nextCursor};
  }catch{throw new BuyerOrderError('Order history returned an invalid response.',503);}
}
