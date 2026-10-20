import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeBuyerOrders} from '../mobile/src/buyer-orders.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const order={id,market_code:'IN',order_status:'confirmed',currency_code:'INR',subtotal_minor:10000,delivery_minor:0,tax_minor:0,total_minor:10000,created_at:'2026-10-20T10:00:00Z'};
function session(){let owner=id;const listeners=new Set();return{snapshot:()=>owner?{userId:owner,reviewerHint:false}:null,getSession:async()=>{if(!owner)throw Object.assign(Error('Synthetic signout'),{status:401});return{userId:owner,accessToken:'synthetic-token'};},subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},change:value=>{owner=value;for(const callback of listeners)callback(owner?{userId:owner,reviewerHint:false}:null);}};}
const options={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const history={apiVersion:1,state:'available',orders:[order],nextCursor:null};
test('native orders use verified bearer identity and shared bounded list/detail states without exposing tokens',async()=>{
 const s=session(),states=[],calls=[];const host=createNativeBuyerOrders({...options,session:s,render:value=>states.push(value),read:async input=>{calls.push(input);return input.orderId?{order,items:[],fulfilments:[],truncated:false}:history;}});
 await host.load();assert.equal(states.at(-1).phase,'ready');assert.equal(calls[0].accessToken,'synthetic-token');assert.equal(calls[0].baseUrl,options.apiBaseUrl);assert.ok(!JSON.stringify(states).includes('synthetic-token'));
 await host.load({orderId:id});assert.equal(states.at(-1).mode,'detail');host.dispose();
});
test('account changes abort private results and expired sessions clear saved orders',async()=>{
 const s=session(),states=[];let finish;
 const host=createNativeBuyerOrders({...options,session:s,render:value=>states.push(value),read:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=host.load();await drainNativeTasks();s.change(other);finish(history);await pending;assert.equal(states.at(-1).phase,'signin');assert.deepEqual(states.at(-1).orders,[]);
 s.change(null);await host.load();assert.equal(states.at(-1).phase,'signin');host.dispose();
});
test('native order origin rejects production before session or order access',()=>{
 let accesses=0;assert.throws(()=>createNativeBuyerOrders({...options,apiBaseUrl:'https://vetit.online',session:{snapshot:()=>{accesses++;}},render(){}}));assert.equal(accesses,0);
});
test('detail failure retries the same order and account changes forget its identifier',async()=>{
 const s=session(),queries=[],states=[];let fail=true;const host=createNativeBuyerOrders({...options,session:s,render:value=>states.push(value),read:async input=>{queries.push(input);if(fail){fail=false;throw Object.assign(Error('Synthetic unavailable'),{status:503});}return input.orderId?{order,items:[],fulfilments:[],truncated:false}:history;}});
 await host.load({orderId:id});assert.equal(states.at(-1).phase,'error');await host.retry();assert.equal(queries[1].orderId,id);
 s.change(other);await host.retry();assert.equal(queries.at(-1).orderId,undefined);host.dispose();
});
test('actual native order component supports details, language fallback and background clearing',async()=>{
 const s=session();const read=async input=>input.orderId?{order,items:[{id,title_snapshot:'Synthetic pet food',quantity:2,unit_price_minor:5000,currency_code:'INR'}],fulfilments:[],truncated:false}:history;
 const ui=mountNativeComponent('NativeBuyerOrders.tsx','NativeBuyerOrders',{...options,session:s,language:'ta'}, {'./buyer-orders.js':{createNativeBuyerOrders:input=>createNativeBuyerOrders({...input,read})}});
 await drainNativeTasks();ui.render();assert.match(ui.text(),/Your orders/);ui.button('View order').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/Synthetic pet food/);assert.match(ui.text(),/No fulfilment updates/);
 ui.appState('background');assert.ok(!ui.text().includes('Synthetic pet food'));assert.match(ui.text(),/Sign in/);ui.unmount();
});
