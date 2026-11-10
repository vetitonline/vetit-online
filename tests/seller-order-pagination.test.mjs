import test from 'node:test';
import assert from 'node:assert/strict';
import {paginationFixture} from './seller-order-pagination-fixture.mjs';
import {requestSellerOrderPage,mergeSellerOrderPages} from '../src/lib/seller/order-pages-client.js';
import {groupSellerOrders} from '../src/lib/seller/order-groups.js';
import {parseSellerOrderPage} from '../src/lib/seller/order-pagination.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),other=id(2),order=id(4),time='2026-11-10T10:00:00.123456+00:00';

test('cursor pagination traverses more than 200 tied-timestamp records once each, without truncation or private fields',async()=>{
 const f=paginationFixture();let snapshot,cursor,calls=0;
 do{const page=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',profileId:owner,cursor,fetchImpl:f.fetchImpl});snapshot=mergeSellerOrderPages(snapshot,page);cursor=page.pagination.nextCursor;calls++;assert.ok(calls<10);}while(cursor);
 assert.equal(calls,6);assert.equal(snapshot.items.length,251);assert.equal(snapshot.fulfilments.length,251);assert.equal(new Set(snapshot.items.map(r=>r.id)).size,251);assert.equal(snapshot.pagination.nextCursor,null);assert.doesNotMatch(JSON.stringify(snapshot),/SECRET/);
 assert.equal(groupSellerOrders(snapshot)[0].subtotalMinor,25100);assert.equal(f.writes.length,0);
 for(const query of f.calls.filter(c=>['order_items','fulfilments'].includes(c.table))){assert.deepEqual(query.steps.filter(s=>s[0]==='order').map(s=>s[1]),['created_at','id']);assert.ok(query.steps.some(s=>s[0]==='limit'&&s[1]===51));assert.ok(query.steps.some(s=>s[0]==='in'&&s[1]==='business_id'));}
 assert.ok(f.calls.some(c=>c.steps.some(s=>s[0]==='or'&&s[1].includes('.123456+00:00'))));
});
test('completed streams are not reread while the other stream still has pages',async()=>{
 const f=paginationFixture(2,130);const page=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',fetchImpl:f.fetchImpl});f.calls.length=0;
 const next=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',profileId:owner,cursor:page.pagination.nextCursor,fetchImpl:f.fetchImpl});assert.equal(next.items.length,0);assert.equal(next.fulfilments.length,50);assert.equal(f.calls.some(c=>c.table==='order_items'),false);
});
test('old bounded API remains compatible while explicit pagination no longer fails on larger histories',async()=>{
 const f=paginationFixture();assert.equal((await f.read()).status,503);assert.equal((await f.read('?paginate=1&limit=100')).status,200);
 const small=paginationFixture(1,1);const response=await small.read();assert.equal(response.status,200);assert.equal((await response.json()).pagination,undefined);
});
test('missing/changed accounts and malformed cursor input stop before any role or data query',async()=>{
 const f=paginationFixture();const page=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',fetchImpl:f.fetchImpl});f.calls.length=0;
 for(const query of ['?paginate=1&limit=0','?paginate=1&limit=101','?paginate=1&limit=1&limit=2','?paginate=1&cursor=bad','?cursor=bad','?fulfilmentId=bad','?fulfilmentId='+id(2000)+'&paginate=1']){assert.equal((await f.read(query)).status,400,query);assert.equal(f.calls.length,0);}
 f.actor(other);assert.equal((await f.read('?paginate=1&cursor='+page.pagination.nextCursor)).status,409);assert.equal(f.calls.length,0);
 const attack=btoa(JSON.stringify({v:1,profileId:other,scope:page.pagination.scope,limit:50,items:{done:false,after:btoa(JSON.stringify({createdAt:time+'),id.gt.0',id:id(1000)})).replace(/=+$/,'')},fulfilments:{done:true,after:null}})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');assert.equal((await f.read('?paginate=1&cursor='+attack)).status,400);assert.equal(f.calls.length,0);
});
test('revoked roles and inactive businesses invalidate cursors before historical data loads',async()=>{
 for(const inactive of [false,true]){
 const f=paginationFixture(),page=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',fetchImpl:f.fetchImpl});if(inactive)f.tables.businesses[0].is_active=false;else f.tables.business_memberships[0].member_role='viewer';f.calls.length=0;
 assert.equal((await f.read('?paginate=1&cursor='+page.pagination.nextCursor)).status,409);assert.equal(f.calls.some(c=>['order_items','fulfilments'].includes(c.table)),false);
 }
});
test('single shipment readback is role-scoped and supports historical records beyond the first page',async()=>{
 const f=paginationFixture(),result=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',profileId:owner,fulfilmentId:id(2000),fetchImpl:f.fetchImpl});assert.equal(result.fulfilment.id,id(2000));assert.equal(result.fulfilment.orderId,order);assert.equal(result.fulfilment.status,'packed');assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 f.tables.fulfilments[0].business_id=other;assert.equal((await f.read('?fulfilmentId='+id(2000))).status,404);assert.equal((await f.read('?fulfilmentId='+id(2001),{'x-vetit-profile-id':other})).status,409);
});
test('shared page merge rejects changed identity/scope, repeated cursors and unsupported limits',async()=>{
 const f=paginationFixture(),page=await requestSellerOrderPage({baseUrl:'https://vetit.invalid',fetchImpl:f.fetchImpl});
 assert.throws(()=>mergeSellerOrderPages(page,page));
 const last={...page,items:[],fulfilments:[],pagination:{...page.pagination,nextCursor:null}};
 assert.throws(()=>mergeSellerOrderPages(page,{...last,profileId:other}));assert.throws(()=>mergeSellerOrderPages(page,{...last,pagination:{...last.pagination,scope:'b'.repeat(64)}}));
 assert.throws(()=>parseSellerOrderPage(new URL('https://vetit.invalid/?paginate=1&limit=25&cursor='+page.pagination.nextCursor),owner));
});
test('native page transport omits cookies, bounds origins and never performs a mutation',async()=>{
 const f=paginationFixture(1,1);await requestSellerOrderPage({baseUrl:'https://vetit.invalid',accessToken:'aaa.bbb.ccc',profileId:owner,fetchImpl:(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.method,'GET');assert.equal(options.headers['x-vetit-profile-id'],owner);return f.fetchImpl(url,options);}});
 await assert.rejects(requestSellerOrderPage({baseUrl:'https://user:password@vetit.invalid',fetchImpl:f.fetchImpl}));assert.equal(f.writes.length,0);
});
