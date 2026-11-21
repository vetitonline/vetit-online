import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderWorkspace} from '../src/lib/buyer/order-workspace.js';
const owner='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002';
test('history refresh replaces paginated results and restarts at the first page',async()=>{
  const calls=[];let state;
  const workspace=createOrderWorkspace({render:value=>state=value,read:async input=>{calls.push(input);return {profileId:owner,orders:[{id:String(calls.length)}],nextCursor:'cursor'+calls.length};}});
  await workspace.load();await workspace.load({more:true});assert.equal(state.orders.length,2);
  await workspace.refresh();assert.equal(state.orders.length,1);assert.equal(state.orders[0].id,'3');assert.equal(calls[2].cursor,undefined);
});
test('detail refresh re-reads immutable detail ID and displays updated shipment status',async()=>{
  let state,calls=0;
  const workspace=createOrderWorkspace({render:value=>state=value,read:async input=>{assert.equal(input.orderId,id);return {profileId:owner,order:{id,order_status:++calls===1?'pending':'processing'},items:[],fulfilments:[{status:calls===1?'pending':'packed'}]};}});
  await workspace.load({orderId:id});await workspace.refresh();assert.equal(state.detail.fulfilments[0].status,'packed');assert.equal(state.detail.order.order_status,'processing');
});
test('repeated refresh is coalesced and sign-out discards pending detail results',async()=>{
  let state,finish,calls=0;
  const workspace=createOrderWorkspace({render:value=>state=value,read:async()=>{calls++;if(calls===1)return {profileId:owner,order:{id},items:[],fulfilments:[]};return new Promise(resolve=>finish=resolve);}});
  await workspace.load({orderId:id});const pending=workspace.refresh();await workspace.refresh();assert.equal(calls,2);
  workspace.clear();finish({profileId:owner,order:{id},items:[],fulfilments:[]});await pending;assert.equal(state.phase,'signin');assert.equal(state.detail,null);
});
test('refresh failures clear stale details and disposal cannot issue a new request',async()=>{
  let state,calls=0;
  const workspace=createOrderWorkspace({render:value=>state=value,read:async()=>{if(++calls>1)throw Error('private');return {profileId:owner,order:{id},items:[],fulfilments:[]};}});
  await workspace.load({orderId:id});await workspace.refresh();assert.equal(state.phase,'error');assert.equal(state.detail,null);workspace.dispose();await workspace.refresh();assert.equal(calls,2);
});
