import {orderId,encodeOrderCursor,normalizeOrderHistoryQuery} from '../buyer/order-contract.js';
export class SellerPaginationError extends Error{constructor(status=400){super(status===409?'Your account or seller access changed. Reload orders.':'Seller order pagination is invalid.');this.status=status;}}
const fail=status=>{throw new SellerPaginationError(status);};
export async function sellerOrderScope(ids){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([...ids].sort().join(',')));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
const position=value=>{if(value===null)return null;if(typeof value!=='string')fail(400);try{return normalizeOrderHistoryQuery(new URLSearchParams({cursor:value})).cursor;}catch{fail(400);}};
export function parseSellerOrderPage(url,profileId){
 const params=url.searchParams;
 for(const key of ['paginate','limit','cursor','fulfilmentId'])if(params.getAll(key).length>1)fail(400);
 if(params.has('fulfilmentId')){if(['paginate','limit','cursor'].some(k=>params.has(k)))fail(400);try{return{fulfilmentId:orderId(params.get('fulfilmentId'))};}catch{fail(400);}}
 if(!params.has('paginate')){if(params.has('limit')||params.has('cursor'))fail(400);return null;}
 if(params.get('paginate')!=='1')fail(400);
 const raw=params.get('limit')??'50';if(!/^(?:[1-9]\d?|100)$/.test(raw))fail(400);const limit=Number(raw);
 let cursor=null;
 if(params.has('cursor'))try{
  const token=params.get('cursor');if(!/^[A-Za-z0-9_-]{1,2048}$/.test(token))fail(400);
  cursor=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));
  if(cursor.v!==1||cursor.profileId!==profileId||cursor.limit!==limit){if(cursor.profileId!==profileId)fail(409);fail(400);}
  if(!/^[a-f0-9]{64}$/.test(cursor.scope))fail(400);
  for(const key of ['items','fulfilments']){const stream=cursor[key];if(!stream||typeof stream.done!=='boolean'||!(stream.after===null||typeof stream.after==='string')||(!stream.done&&stream.after===null))fail(400);position(stream.after);}
  if(cursor.items.done&&cursor.fulfilments.done)fail(400);
 }catch(error){if(error instanceof SellerPaginationError)throw error;fail(400);}
 return{limit,cursor};
}
export function applySellerOrderPosition(query,stream){
 const after=position(stream?.after??null);
 return after?query.or(`created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`):query;
}
export function sellerOrderStream(result,limit,previous){
 if(previous?.done)return{rows:[],cursor:previous};
 if(result.error||!Array.isArray(result.data)||result.data.length>limit+1)throw Error('Seller order page is unavailable.');
 const rows=result.data.slice(0,limit),more=result.data.length>limit;
 return{rows,cursor:{done:!more,after:rows.length?encodeOrderCursor(rows.at(-1)):previous?.after??null}};
}
export function encodeSellerOrderPage({profileId,scope,limit,items,fulfilments}){
 if(items.done&&fulfilments.done)return null;
 return btoa(JSON.stringify({v:1,profileId,scope,limit,items,fulfilments})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
