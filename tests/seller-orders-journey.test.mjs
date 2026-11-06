import test from 'node:test';
import assert from 'node:assert/strict';
import { createSellerOrdersHandler,fulfilmentActions } from '../src/lib/seller/orders.js';
const user='10000000-0000-4000-8000-000000000001',business='10000000-0000-4000-8000-000000000002',id='10000000-0000-4000-8000-000000000003';
const line={id,order_id:id,listing_id:id,business_id:business,product_variant_id:null,title_snapshot:'Harness',quantity:2,unit_price_minor:12500,currency_code:'INR',private:'DO_NOT_LEAK'};
const fulfilment={id,order_id:id,business_id:business,status:'packed',carrier:null,tracking_reference:null,shipped_at:null,delivered_at:null};
function fixture({state='authenticated',results,mutation=false}={}){
  const calls=[],rpcs=[];
  const queue=results??[{data:[{business_id:business,member_role:'fulfillment_manager'}],count:1},{data:[{id:business}],count:1},...(mutation?[{data:{id,business_id:business,status:'packed'}}]:[{data:[line],count:1},{data:[fulfilment],count:1}])];
  const client={from(table){const steps=[table];calls.push(steps);const result=queue.shift();const q={then:resolve=>Promise.resolve(result).then(resolve)};for(const method of ['select','eq','in','limit','order','is','maybeSingle'])q[method]=(...args)=>{steps.push([method,...args]);return q;};return q;}};
  const handler=createSellerOrdersHandler({authenticate:async()=>({state,user:{id:user},supabase:client}),rpc:async(_client,name,args)=>{rpcs.push([name,args]);return{data:id};}});
  return{calls,rpcs,read:()=>handler({request:new Request('https://test.invalid/api/seller/orders')}),write:(headers={},body={fulfilmentId:id,nextStatus:'shipped',carrier:'Test carrier',trackingReference:'TEST-TRACK'})=>handler({request:new Request('https://test.invalid/api/seller/orders',{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json','x-vetit-profile-id':user,...headers},body:JSON.stringify(body)})})};
}
test('seller visibility is limited to active permitted business roles and excludes private snapshots',async()=>{
  const f=fixture(),r=await f.read();assert.equal(r.status,200);const body=await r.json();assert.equal(body.items[0].orderId,id);assert.equal(body.fulfilments[0].status,'packed');assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'),false);
  assert.equal(r.headers.get('cache-control'),'private, no-store');assert.ok(JSON.stringify(f.calls[0]).includes('fulfillment_manager'));assert.ok(JSON.stringify(f.calls[0]).includes(user));
  for(const call of f.calls.slice(2))assert.ok(JSON.stringify(call).includes(business));
});
test('missing roles, inactive businesses, partial data and unavailable auth do not expose order records',async()=>{
  for(const state of ['unauthenticated','unavailable']){const f=fixture({state});assert.equal((await f.read()).status,state==='unavailable'?503:401);assert.equal(f.calls.length,0);}
  const noRole=fixture({results:[{data:[],count:0}]});assert.deepEqual((await(await noRole.read()).json()).items,[]);assert.equal(noRole.calls.length,1);
  const partial=fixture({results:[{data:[{business_id:business}],count:2}]});assert.equal((await partial.read()).status,503);
  const inactive=fixture({results:[{data:[{business_id:business}],count:1},{data:[],count:0}]});assert.deepEqual((await(await inactive.read()).json()).items,[]);
});
test('shipment mutation checks cookie origin, current identity and owned fulfilment before scoped RPC',async()=>{
  for(const headers of [{origin:'https://foreign.invalid'},{'x-vetit-profile-id':id}]){const f=fixture({mutation:true});assert.ok([403,409].includes((await f.write(headers)).status));assert.equal(f.rpcs.length,0);}
  const f=fixture({mutation:true});assert.equal((await f.write()).status,200);assert.deepEqual(f.rpcs,[['advance_seller_fulfilment',{p_fulfilment_id:id,p_next_status:'shipped',p_carrier:'Test carrier',p_tracking_reference:'TEST-TRACK'}]]);
  assert.ok(JSON.stringify(f.calls[2]).includes(business));
});
test('foreign shipments, unsupported transitions and missing tracking cannot write',async()=>{
  const missing=fixture({results:[{data:[{business_id:business}],count:1},{data:[{id:business}],count:1},{data:null}]});assert.equal((await missing.write()).status,404);assert.equal(missing.rpcs.length,0);
  const f=fixture({mutation:true});assert.equal((await f.write({}, {fulfilmentId:id,nextStatus:'delivered'})).status,409);assert.equal(f.rpcs.length,0);
  const invalid=fixture({mutation:true});assert.equal((await invalid.write({}, {fulfilmentId:id,nextStatus:'shipped'})).status,400);assert.equal(invalid.rpcs.length,0);
  assert.deepEqual(fulfilmentActions('delivered'),[]);assert.deepEqual(fulfilmentActions('pending'),['packed','cancelled']);
});
