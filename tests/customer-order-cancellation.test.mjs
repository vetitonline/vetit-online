import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuyerOrderCancelHandler} from '../src/lib/buyer/order-cancel-api.js';
import {requestBuyerOrderCancellation} from '../src/lib/buyer/order-cancel-client.js';
import {createOrderWorkspace} from '../src/lib/buyer/order-workspace.js';
import {requestBuyerOrders} from '../src/lib/buyer/orders-client.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),target=id(2);
const order=(status='pending')=>({id:target,customer_profile_id:owner,market_code:'IN',order_status:status,currency_code:'INR',subtotal_minor:10000,delivery_minor:500,tax_minor:100,total_minor:10600,created_at:'2026-11-10T12:00:00Z'});
const detail=(status='pending')=>({apiVersion:1,state:'available',profileId:owner,order:order(status),items:[],fulfilments:[{id:id(3),business_id:id(4),status:status==='cancelled'?'cancelled':'pending',carrier:null,tracking_reference:null,shipped_at:null,delivered_at:null}],truncated:false});
function setup({authState='authenticated',found=true,status='pending',error=null,result=order('cancelled')}={}){
  const queries=[],writes=[];let state=status;
  const handler=createBuyerOrderCancelHandler({authenticate:async()=>({state:authState,user:{id:owner},supabase:{
    from(table){const filters=[];queries.push({table,filters});const query={select:()=>query,eq:(...args)=>{filters.push(args);return query;},maybeSingle:async()=>({data:found?{id:target,order_status:state}:null})};return query;},
    rpc:async(name,args)=>{writes.push({name,args});if(!error)state='cancelled';return{data:result,error};}
  }})});
  const request=(headers={},body={orderId:target},method='POST')=>handler({request:new Request('https://vetit.invalid/api/buyer/orders/cancel',{method,headers:{origin:'https://vetit.invalid','content-type':'application/json','x-vetit-profile-id':owner,...headers},...(!['GET','HEAD'].includes(method)?{body:JSON.stringify(body)}:{})})});
  return{handler,request,queries,writes};
}
test('cancellation API binds origin, authentication and expected account before any database access',async()=>{
  for(const [headers,status] of [[{origin:'https://attacker.invalid'},403],[{'sec-fetch-site':'cross-site'},403],[{'x-vetit-profile-id':id(9)},409],[{'content-type':'text/plain'},415]]){
    const s=setup();assert.equal((await s.request(headers)).status,status);assert.equal(s.queries.length,0);assert.equal(s.writes.length,0);
  }
  for(const state of ['unauthenticated','unavailable']){const s=setup({authState:state});assert.equal((await s.request()).status,state==='unavailable'?503:401);assert.equal(s.queries.length,0);}
  const s=setup();assert.equal((await s.request({},undefined,'GET')).status,405);
});
test('foreign orders and non-pending states cannot invoke cancellation, including paid or shipped orders',async()=>{
  for(const status of ['confirmed','processing','fulfilled','refunded']){
    const s=setup({status});assert.equal((await s.request()).status,409);assert.equal(s.writes.length,0);
  }
  const s=setup({found:false});assert.equal((await s.request()).status,404);assert.equal(s.writes.length,0);
  assert.deepEqual(s.queries[0],{table:'orders',filters:[['customer_profile_id',owner],['id',target]]});
});
test('owned cancellation uses only the atomic user-scoped RPC and supports idempotent confirmation',async()=>{
  const s=setup();for(let i=0;i<2;i++){
    const response=await s.request({}, {orderId:target,customerId:id(9),amount_minor:1});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const body=await response.json();assert.equal(body.profileId,owner);assert.equal(body.order.order_status,'cancelled');assert.equal('customer_profile_id' in body.order,false);
  }
  assert.deepEqual(s.writes,[{name:'cancel_my_checkout_order',args:{p_order_id:target}},{name:'cancel_my_checkout_order',args:{p_order_id:target}}]);
});
test('invalid/oversized bodies stop before queries; permission, transaction and missing RPC errors never fall back',async()=>{
  const s=setup();assert.equal((await s.request({}, {orderId:'invalid'})).status,400);assert.equal((await s.request({}, {orderId:target,padding:'x'.repeat(2000)})).status,413);assert.equal(s.queries.length,0);
  for(const [code,status] of [['42501',403],['40001',409],['PGRST202',503],['XX000',503]]){
    const scenario=setup({error:{code,message:'PRIVATE SQL DETAILS'}});const response=await scenario.request();assert.equal(response.status,status);assert.equal(scenario.writes.length,1);assert.doesNotMatch(await response.text(),/PRIVATE SQL DETAILS/);
  }
});
test('wrong-owner, wrong-order and unconfirmed RPC results require reconciliation',async()=>{
  for(const patch of [{customer_profile_id:id(8)},{id:id(8)},{order_status:'pending'},{total_minor:1}]){
    const s=setup({result:{...order('cancelled'),...patch}});assert.equal((await s.request()).status,503);assert.equal(s.writes.length,1);
  }
});
test('shared native/browser mutation client consumes actual API and avoids cookies or redirects with bearer auth',async()=>{
  for(const accessToken of [undefined,'aaa.bbb.ccc']){
    const s=setup();let captured;
    const response=await requestBuyerOrderCancellation({baseUrl:'https://vetit.invalid',orderId:target,profileId:owner,accessToken,fetchImpl:async(url,options)=>{captured=options;return s.handler({request:new Request(url,{...options,headers:{...options.headers,...(!accessToken?{origin:'https://vetit.invalid'}:{})}})});}});
    assert.equal(response.order.order_status,'cancelled');assert.equal(captured.credentials,accessToken?'omit':'same-origin');assert.equal(captured.redirect,'error');assert.equal(captured.headers['x-vetit-profile-id'],owner);
  }
});
test('mutation transport never retries ambiguous writes and validates every acknowledgement',async()=>{
  let calls=0;await assert.rejects(requestBuyerOrderCancellation({baseUrl:'https://vetit.invalid',orderId:target,profileId:owner,fetchImpl:async()=>{calls++;throw Error('network');}}),/could not be confirmed/);assert.equal(calls,1);
  for(const patch of [{profileId:id(8)},{order:order('pending')},{order:{...order('cancelled'),id:id(9)}}])await assert.rejects(requestBuyerOrderCancellation({baseUrl:'https://vetit.invalid',orderId:target,profileId:owner,fetchImpl:async()=>Response.json({apiVersion:1,state:'cancelled',profileId:owner,order:order('cancelled'),...patch})}),/reconciliation/);
  await assert.rejects(requestBuyerOrderCancellation({baseUrl:'https://user:password@vetit.invalid',orderId:target,profileId:owner}),/configuration/);
});
test('workspace confirms cancellation with fresh owned order and shipment readback and coalesces repeated taps',async()=>{
  let state,resolve,writes=0,current=detail();const workspace=createOrderWorkspace({render:value=>state=value,read:async()=>current,cancel:async command=>{writes++;assert.equal(command.profileId,owner);assert.equal(command.orderId,target);return new Promise(done=>resolve=done);}});
  await workspace.load({orderId:target});const pending=workspace.cancel();assert.equal(state.phase,'saving');await workspace.cancel();assert.equal(writes,1);
  current=detail('cancelled');resolve({profileId:owner,order:order('cancelled')});await pending;assert.equal(state.notice,'cancelled');assert.equal(state.detail.order.order_status,'cancelled');await workspace.cancel();assert.equal(writes,1);
});
test('workspace cannot cancel read-only legacy details and non-pending orders',async()=>{
  let writes=0;for(const current of [{...detail(),profileId:undefined},detail('confirmed')]){
    const workspace=createOrderWorkspace({render(){},read:async()=>current,cancel:async()=>{writes++;}});await workspace.load({orderId:target});await workspace.cancel();
  }assert.equal(writes,0);
});
test('unknown cancellation results, changed account or inconsistent fulfilments clear private details and require explicit reload',async()=>{
  for(const mode of ['network','account','shipment','state']){
    let state,writes=0;const workspace=createOrderWorkspace({render:value=>state=value,cancel:async()=>{writes++;if(mode==='network')throw Error('unknown');return{profileId:owner,order:order('cancelled')};},read:async()=>{if(!writes)return detail();const current=detail('cancelled');if(mode==='account')current.profileId=id(8);if(mode==='shipment')current.fulfilments[0].status='shipped';if(mode==='state')current.order.order_status='pending';return current;}});
    await workspace.load({orderId:target});await workspace.cancel();assert.equal(state.detail,null);assert.equal(state.notice,'reconcile');await workspace.cancel();assert.equal(writes,1);
  }
});
test('account invalidation and disposal drop late responses and prevent mutation readback',async()=>{
  for(const dispose of [false,true]){
    let state,resolve,reads=0;const workspace=createOrderWorkspace({render:value=>state=value,read:async()=>{reads++;return detail();},cancel:async()=>new Promise(done=>resolve=done)});
    await workspace.load({orderId:target});const pending=workspace.cancel();dispose?workspace.dispose():workspace.clear();resolve({profileId:owner,order:order('cancelled')});await pending;assert.equal(reads,1);if(!dispose){assert.equal(state.detail,null);assert.equal(state.phase,'signin');}
  }
});
test('history client preserves optional verified profile identity and rejects malformed account identifiers',async()=>{
  const result=await requestBuyerOrders({baseUrl:'https://vetit.invalid',orderId:target,fetchImpl:async()=>Response.json(detail())});assert.equal(result.profileId,owner);
  await assert.rejects(requestBuyerOrders({baseUrl:'https://vetit.invalid',orderId:target,fetchImpl:async()=>Response.json({...detail(),profileId:'invalid'})}));
});
test('pagination cannot mix private order lists from different customer identities',async()=>{
  let state,calls=0;const cursor=Buffer.from(JSON.stringify({createdAt:order().created_at,id:target})).toString('base64url');
  const workspace=createOrderWorkspace({render:value=>state=value,read:async()=>({orders:[order()],nextCursor:cursor,profileId:++calls===1?owner:id(9)})});
  await workspace.load();await workspace.load({more:true});assert.equal(state.phase,'signin');assert.deepEqual(state.orders,[]);
});
