import {normalizeSellerOrders} from './order-groups.js';
import {orderId,normalizeOrderFulfilment} from '../buyer/order-contract.js';
import {parseSellerOrderPage} from './order-pagination.js';
const fail=status=>{throw Object.assign(Error(status===409?'Your account or seller access changed. Reload orders.':'Seller orders are unavailable. Reload to check current records.'),{status});};
export function normalizeSellerOrderPage(input){
 const data=normalizeSellerOrders(input),page=input.pagination;
 if(!page||!/^[a-f0-9]{64}$/.test(page.scope)||!Number.isInteger(page.limit)||page.limit<1||page.limit>100||data.items.length>page.limit||data.fulfilments.length>page.limit||!(page.nextCursor===null||typeof page.nextCursor==='string'))fail(503);
 if(page.nextCursor){try{const parsed=parseSellerOrderPage(new URL(`https://pagination.invalid/?paginate=1&limit=${page.limit}&cursor=${page.nextCursor}`),data.profileId);if(parsed.cursor.scope!==page.scope)fail(503);}catch{fail(503);}}
 return{...data,pagination:{scope:page.scope,limit:page.limit,nextCursor:page.nextCursor}};
}
/** Merge only pages from the same current account and operational business scope. */
export function mergeSellerOrderPages(previous,next){
 const page=normalizeSellerOrderPage(next);
 if(!previous)return page;
 const before=normalizeSellerOrders(previous,{maxRecords:5000});
 if(before.profileId!==page.profileId||previous.pagination.scope!==page.pagination.scope||previous.pagination.limit!==page.pagination.limit)fail(409);
 if(!previous.pagination.nextCursor||previous.pagination.nextCursor===page.pagination.nextCursor)fail(503);
 const merge=(a,b)=>[...new Map([...a,...b].map(row=>[row.id,row])).values()];
 const result={...page,items:merge(before.items,page.items),fulfilments:merge(before.fulfilments,page.fulfilments)};
 if(result.items.length>5000||result.fulfilments.length>5000)fail(503);
 // Validate cross-page currency and ownership-related record invariants in the renderer.
 return result;
}
export async function requestSellerOrderPage({baseUrl=globalThis.location?.origin,accessToken,profileId,cursor,fulfilmentId,signal,fetchImpl=fetch}={}){
 let origin;try{origin=new URL(baseUrl);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();if(profileId!==undefined)orderId(profileId);if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||/\s/.test(accessToken)))throw Error();}catch{fail(400);}
 const url=new URL('/api/seller/orders',origin);
 if(fulfilmentId)url.searchParams.set('fulfilmentId',orderId(fulfilmentId));else{url.searchParams.set('paginate','1');url.searchParams.set('limit','50');if(cursor)url.searchParams.set('cursor',cursor);}
 let response;try{response=await fetchImpl(url,{method:'GET',signal,credentials:accessToken?'omit':'same-origin',redirect:'error',cache:'no-store',headers:{accept:'application/json',...(profileId?{'x-vetit-profile-id':profileId}:{}),...(accessToken?{authorization:`Bearer ${accessToken}`}:{})}});}catch{fail(0);}
 if(!response.ok)fail(response.status);
 try{const body=await response.json();if(profileId&&body.profileId!==profileId)fail(409);
  if(fulfilmentId){if(body.apiVersion!==1||body.state!=='available'||!/^[a-f0-9]{64}$/.test(body.scope)||body.fulfilment?.id!==fulfilmentId)fail(503);return{apiVersion:1,state:'available',profileId:orderId(body.profileId),scope:body.scope,fulfilment:{...normalizeOrderFulfilment(body.fulfilment),orderId:orderId(body.fulfilment.orderId)}};}
  return normalizeSellerOrderPage(body);
 }catch(error){if(error.status===409)throw error;fail(503);}
}
