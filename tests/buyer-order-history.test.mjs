import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuyerOrderHistoryHandler} from '../src/lib/buyer/order-history.js';
import {BuyerOrderError,encodeOrderCursor,normalizeOrderHistoryQuery} from '../src/lib/buyer/order-contract.js';
import {requestBuyerOrders} from '../src/lib/buyer/orders-client.js';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const order={id,market_code:'IN',order_status:'confirmed',currency_code:'INR',subtotal_minor:10000,delivery_minor:100,tax_minor:1800,total_minor:11900,created_at:'2026-10-15T12:00:00.123456+00:00'};
const item={id,listing_id:id,business_id:other,product_variant_id:null,title_snapshot:'Original title',quantity:2,unit_price_minor:5000,currency_code:'INR'};
const fulfilment={id,business_id:other,status:'shipped',carrier:'Local carrier',tracking_reference:'TEST_ONLY',shipped_at:'2026-10-15T12:00:00Z',delivered_at:null};
function setup(results=[],state='authenticated'){
  const calls=[];let authCalls=0;
  const supabase={from(table){const record={table,steps:[]};calls.push(record);const result=results.shift();const query={then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};for(const method of ['select','eq','order','limit','or','maybeSingle'])query[method]=(...args)=>{record.steps.push([method,...args]);return query;};return query;}};
  const handler=createBuyerOrderHistoryHandler({authenticate:async()=>{authCalls++;return{state,supabase,user:{id:other}};}});
  return{calls,get authCalls(){return authCalls;},async read(search=''){const url=new URL('http://localhost/api/buyer/orders'+search);return handler({request:new Request(url),cookies:{},url});}};
}
test('authentication gates all queries, including malformed input',async()=>{
  for(const state of ['unauthenticated','unavailable']){const s=setup([],state);const r=await s.read('?limit=bad');assert.equal(r.status,state==='unavailable'?503:401);assert.equal(s.calls.length,0);}
});
test('history is explicitly scoped to verified customer, bounded, uncached and stripped of private snapshots',async()=>{
  const s=setup([{data:[{...order,delivery_address_snapshot:{secret:'DO_NOT_LEAK'}},{...order,id:other}],error:null}]);
  const r=await s.read('?limit=1&customerId='+id);const body=await r.json();
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(body.orders.length,1);assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'),false);assert.equal(body.nextCursor,encodeOrderCursor(order));
  assert.ok(s.calls[0].steps.some(step=>step[0]==='eq'&&step[1]==='customer_profile_id'&&step[2]===other));
  assert.ok(s.calls[0].steps.some(step=>step[0]==='limit'&&step[1]===2));
  assert.deepEqual(s.calls[0].steps.filter(step=>step[0]==='order').map(step=>step[1]),['created_at','id']);
});
test('cursor preserves PostgreSQL microseconds and uses UUID tie-breaking without filter injection',async()=>{
  const cursor=encodeOrderCursor(order);const s=setup([{data:[],error:null}]);await s.read('?cursor='+cursor);
  assert.equal(normalizeOrderHistoryQuery(new URLSearchParams({cursor})).cursor.createdAt,order.created_at);
  assert.equal(s.calls[0].steps.find(step=>step[0]==='or')[1],`created_at.lt.${order.created_at},and(created_at.eq.${order.created_at},id.lt.${id})`);
  const attack=btoa(JSON.stringify({createdAt:'2026-10-15T12:00:00Z),id.gt.0',id})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const denied=setup();assert.equal((await denied.read('?cursor='+attack)).status,400);assert.equal(denied.calls.length,0);
});
test('invalid pagination/IDs fail before queries and unknown owned detail does not load children',async()=>{
  for(const search of ['?limit=0','?limit=51','?limit=1.5','?cursor=bad','?orderId=bad','?orderId='+id+'&limit=1']){const s=setup();assert.equal((await s.read(search)).status,400);assert.equal(s.calls.length,0);}
  const s=setup([{data:null,error:null}]);assert.equal((await s.read('?orderId='+id)).status,404);assert.equal(s.calls.length,1);
});
test('owned detail returns saved prices and fulfilment states with bounded children only',async()=>{
  const s=setup([{data:order,error:null},{data:Array(101).fill({...item,secret:'DO_NOT_LEAK'}),error:null},{data:[fulfilment],error:null}]);
  const r=await s.read('?orderId='+id);const body=await r.json();assert.equal(r.status,200);assert.equal(body.order.total_minor,11900);assert.equal(body.items[0].unit_price_minor,5000);assert.equal(body.items.length,100);assert.equal(body.truncated,true);assert.equal(body.fulfilments[0].status,'shipped');
  assert.equal(JSON.stringify(body).includes('DO_NOT_LEAK'),false);
  for(const call of s.calls.slice(1)){assert.ok(call.steps.some(step=>step[0]==='eq'&&step[1]==='order_id'&&step[2]===id));assert.ok(call.steps.some(step=>step[0]==='limit'&&step[1]===101));}
});
test('database failures, inconsistent totals and malformed children fail closed without raw error disclosure',async()=>{
  for(const result of [{data:null,error:{message:'PRIVATE_SQL'}},{data:[{...order,total_minor:1}],error:null},{data:[null],error:null}]){const s=setup([result]);const r=await s.read();assert.equal(r.status,503);assert.equal((await r.text()).includes('PRIVATE_SQL'),false);}
  const s=setup([{data:order,error:null},{data:[{...item,currency_code:'USD'}],error:null},{data:[],error:null}]);assert.equal((await s.read('?orderId='+id)).status,503);
});
test('shared web/mobile client preserves cookie/bearer transport and validates sparse HTTP errors before JSON',async()=>{
  for(const accessToken of [undefined,'synthetic-token']){
    let captured;const result=await requestBuyerOrders({baseUrl:'http://localhost:4322',accessToken,fetchImpl:async(url,options)=>{captured={url,options};return new Response(JSON.stringify({apiVersion:1,state:'available',orders:[order],nextCursor:null}));}});
    assert.equal(result.orders[0].total_minor,11900);assert.equal(captured.options.credentials,accessToken?'omit':'same-origin');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.cache,'no-store');assert.equal(captured.options.headers.authorization,accessToken?'Bearer synthetic-token':undefined);
  }
  for(const status of [401,404,503])await assert.rejects(()=>requestBuyerOrders({baseUrl:'http://localhost',fetchImpl:async()=>new Response('PRIVATE_ERROR',{status})}),error=>error instanceof BuyerOrderError&&error.status===status&&!error.message.includes('PRIVATE_ERROR'));
});
test('client rejects unsafe origins, mismatched details and malformed response rows',async()=>{
  await assert.rejects(()=>requestBuyerOrders({baseUrl:'https://user:password@example.test'}),BuyerOrderError);
  for(const body of [{apiVersion:1,state:'available',orders:[null],nextCursor:null},{apiVersion:1,state:'available',order:{...order,id:other},items:[],fulfilments:[],truncated:false}]){
    await assert.rejects(()=>requestBuyerOrders({baseUrl:'http://localhost',...(body.order?{orderId:id}:{}),fetchImpl:async()=>new Response(JSON.stringify(body))}),BuyerOrderError);
  }
});

test('shared detail client consumes the actual handler contract in process without network or database access',async()=>{
  const s=setup([{data:order,error:null},{data:[item],error:null},{data:[fulfilment],error:null}]);
  const result=await requestBuyerOrders({baseUrl:'http://localhost',orderId:id,fetchImpl:async url=>s.read(new URL(url).search)});
  assert.equal(result.order.id,id);assert.equal(result.items[0].title_snapshot,'Original title');assert.equal(result.fulfilments[0].tracking_reference,'TEST_ONLY');assert.equal(result.truncated,false);
});
