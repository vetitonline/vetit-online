import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminOrdersHandler} from '../src/lib/admin/orders.js';
import {encodeOrderCursor} from '../src/lib/buyer/order-contract.js';
const id='10000000-0000-4000-8000-000000000001';
const order={id,market_code:'IN',currency_code:'INR',order_status:'pending',subtotal_minor:100,delivery_minor:10,tax_minor:0,total_minor:110,created_at:'2026-11-21T12:00:00.123456Z'};
function fixture({state='authenticated',claim=true,userClaim,rows=[order],error}={}) {
 const calls=[];const handler=createAdminOrdersHandler({authenticate:async()=>({state,user:{id,app_metadata:{vetit_admin:claim},user_metadata:{vetit_admin:userClaim}},supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:rows,error};}}})});
 return {calls,read:(query='',method='GET')=>handler({request:new Request('https://test.invalid/api/admin/orders'+query,{method})})};
}
test('only authenticated trusted admin claims may access the read-only RPC',async()=>{
 for(const options of [{state:'unauthenticated'},{state:'unavailable'},{claim:false,userClaim:true},{claim:'false'},{claim:1}]){const f=fixture(options);const response=await f.read();assert.ok([401,403,503].includes(response.status));assert.equal(f.calls.length,0);}
 const f=fixture({claim:'true'});assert.equal((await f.read()).status,200);
});
test('method and invalid pagination cannot query backend',async()=>{
 for(const [query,method,status] of [['','POST',405],['?limit=51','GET',400],['?orderId='+id,'GET',400],['?cursor=bad','GET',400]]){const f=fixture();assert.equal((await f.read(query,method)).status,status);assert.equal(f.calls.length,0);}
});
test('overview is bounded, uncached and excludes private fields from responses',async()=>{
 const f=fixture({rows:[{...order,customer_profile_id:id,delivery_address_snapshot:'PRIVATE'}, {...order,id:'10000000-0000-4000-8000-000000000002'}]});
 const response=await f.read('?limit=1');const body=await response.json();assert.equal(body.orders.length,1);assert.equal(body.nextCursor,encodeOrderCursor(order));assert.equal(JSON.stringify(body).includes('PRIVATE'),false);assert.equal(body.orders[0].customer_profile_id,undefined);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(f.calls[0].args.p_limit,2);
 const next=fixture();await next.read('?cursor='+body.nextCursor);assert.equal(next.calls[0].args.p_before_created_at,order.created_at);assert.equal(next.calls[0].args.p_before_id,id);
});
test('missing proposal and revoked database permissions fail closed without leaking diagnostics',async()=>{
 for(const code of ['42883','42501']){const f=fixture({error:{code,message:'secret'}});const response=await f.read();assert.equal(response.status,code==='42501'?403:503);assert.equal((await response.text()).includes('secret'),false);}
});
test('duplicate records, invalid totals and oversized backend pages cannot be shown',async()=>{
 for(const rows of [[order,order],[{...order,total_minor:1}],Array(22).fill(order)]){assert.equal((await fixture({rows}).read()).status,503);}
});
