import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSellerInventory,normalizeInventoryChange } from '../src/lib/seller/inventory-contract.js';
import { createInventoryHandler } from '../src/lib/seller/inventory-api.js';
import { requestSellerInventory } from '../src/lib/seller/inventory-client.js';
import { createInventoryWorkspace } from '../src/lib/seller/inventory-workspace.js';
import { inventoryCopy } from '../src/lib/seller/inventory-copy.js';
import { readProductStock } from '../src/lib/commerce/product-stock.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-11-10T12:00:00.123456+00:00';
const stock=(qty=8)=>({apiVersion:1,state:'available',profileId:id(1),businesses:[{id:id(2),name:'Synthetic seller'}],variants:[{variantId:id(3),listingId:id(4),businessId:id(2),title:'Shirt',sku:'SHIRT-M',attributes:{size:'M'},inventoryId:id(5),quantityOnHand:qty,quantityReserved:2,updatedAt:stamp}]});
const change={businessId:id(2),productVariantId:id(3),quantityOnHand:9,expectedInventoryId:id(5),expectedUpdatedAt:stamp};
const context=(method='GET',body,headers={})=>({request:new Request('https://vetit.invalid/api/seller/stock',{method,headers:{origin:'https://vetit.invalid','content-type':'application/json','x-vetit-profile-id':id(1),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),cookies:{}});
test('inventory contracts validate ownership, reserved units, whole counts and explicit unknown stock',()=>{
  assert.deepEqual(normalizeSellerInventory(stock()),stock());
  assert.deepEqual(normalizeInventoryChange(change),change);
  for(const bad of [-1,1.2,Infinity,10000001,'9'])assert.throws(()=>normalizeInventoryChange({...change,quantityOnHand:bad}));
  assert.throws(()=>normalizeInventoryChange({...change,expectedInventoryId:null}));
  assert.throws(()=>normalizeInventoryChange({...change,stockLocation:'foreign warehouse'}));
  for(const patch of [{businessId:id(9)},{quantityReserved:9},{inventoryId:null},{updatedAt:'yesterday'}]){
    const data=stock();Object.assign(data.variants[0],patch);assert.throws(()=>normalizeSellerInventory(data));
  }
  const unknown=stock();Object.assign(unknown.variants[0],{inventoryId:null,quantityOnHand:null,quantityReserved:null,updatedAt:null});
  assert.equal(normalizeSellerInventory(unknown).variants[0].quantityOnHand,null);
  assert.throws(()=>normalizeSellerInventory({...stock(),variants:[stock().variants[0],stock().variants[0]]}));
});
test('inventory API requires authentication, same-origin cookies and the same account; supports native bearer',async()=>{
  let calls=[];const handler=createInventoryHandler({authenticate:async()=>({state:'authenticated',user:{id:id(1)},supabase:{rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='get_my_seller_inventory'?stock():id(5),error:null};}}})});
  const get=await handler(context());assert.equal(get.status,200);assert.match(get.headers.get('cache-control'),/no-store/);
  assert.equal((await get.json()).variants[0].quantityReserved,2);
  assert.equal((await handler(context('POST',change,{origin:'https://attacker.invalid'}))).status,403);
  assert.equal((await handler(context('POST',change,{'x-vetit-profile-id':id(9)}))).status,409);
  assert.equal(calls.length,1);
  assert.equal((await handler(context('POST',change,{origin:'null',authorization:'Bearer aaa.bbb.ccc'}))).status,200);
  assert.deepEqual(calls[1],['set_seller_inventory_checked',{p_business_id:id(2),p_product_variant_id:id(3),p_quantity_on_hand:9,p_expected_inventory_id:id(5),p_expected_updated_at:stamp}]);
  const unauthorized=createInventoryHandler({authenticate:async()=>({state:'unauthorized'})});assert.equal((await unauthorized(context())).status,401);
  assert.equal((await handler(context('POST',{...change,quantityOnHand:1.2}))).status,400);
  assert.equal(calls.length,2);
});
test('stale edits, permission errors and missing backend fail closed without old-RPC fallback or automatic retries',async()=>{
  for(const [code,status] of [['40001',409],['42501',403],['23514',422],['PGRST202',503]]){
    let writes=0;const handler=createInventoryHandler({authenticate:async()=>({state:'authenticated',user:{id:id(1)},supabase:{rpc:async()=>{writes++;return{error:{code,message:'private database details'}};}}})});
    const response=await handler(context('POST',change));assert.equal(response.status,status);assert.equal(writes,1);assert.doesNotMatch(await response.text(),/private database details/);
  }
});
test('shared inventory transport binds account identity and keeps native bearer tokens off cookies and redirects',async()=>{
  let capture;
  const handler=createInventoryHandler({authenticate:async()=>({state:'authenticated',user:{id:id(1)},supabase:{rpc:async()=>({data:id(5)})}})});
  const ack=await requestSellerInventory({baseUrl:'https://vetit.invalid',accessToken:'aaa.bbb.ccc',change,profileId:id(1),fetchImpl:async(url,options)=>{capture=options;return handler({request:new Request(url,options)});}});
  assert.equal(ack.inventoryLevelId,id(5));assert.equal(capture.credentials,'omit');assert.equal(capture.redirect,'error');assert.equal(capture.headers['x-vetit-profile-id'],id(1));
  let count=0;await assert.rejects(requestSellerInventory({baseUrl:'https://vetit.invalid',change,profileId:id(1),fetchImpl:async()=>{count++;throw Error('disconnected');}}),/could not be confirmed/);assert.equal(count,1);
  await assert.rejects(requestSellerInventory({baseUrl:'https://vetit.invalid/other'}),/configuration/);
});
test('workspace derives ownership and expectations from loaded rows, checks reserved minimum and confirms readback',async()=>{
  let state,writes=0,latest=stock();const workspace=createInventoryWorkspace({render:value=>state=value,read:async input=>{if(input.change){writes++;assert.deepEqual(input.change,change);assert.equal(input.profileId,id(1));latest=stock(9);return{inventoryLevelId:id(5)};}return latest;}});
  await workspace.load();await assert.rejects(workspace.save(id(3),1),/reserved/);assert.equal(writes,0);
  await workspace.save(id(3),9);assert.equal(state.phase,'ready');assert.equal(state.inventory.variants[0].quantityOnHand,9);assert.equal(writes,1);
  workspace.clear();assert.equal(state.inventory,null);await workspace.save(id(3),10);assert.equal(writes,1);
});
test('workspace suppresses duplicate taps and discards late responses after an account change',async()=>{
  let state,resolve,writes=0;const workspace=createInventoryWorkspace({render:value=>state=value,read:async input=>{if(input.change){writes++;return new Promise(done=>resolve=done);}return stock();}});
  await workspace.load();const pending=workspace.save(id(3),9);await workspace.save(id(3),10);assert.equal(writes,1);workspace.clear();resolve({inventoryLevelId:id(5)});await pending;assert.equal(state.phase,'signin');assert.equal(state.inventory,null);
});
test('workspace locks after uncertain writes or changed readback identities until explicit reload',async()=>{
  for(const mode of ['network','account','stock']){
    let state,writes=0;const workspace=createInventoryWorkspace({render:value=>state=value,read:async input=>{if(input.change){writes++;if(mode==='network')throw Error('Unknown commit result.');return{inventoryLevelId:id(5)};}const data=stock(writes?mode==='stock'?10:9:8);if(writes&&mode==='account')data.profileId=id(8);return data;}});
    await workspace.load();await workspace.save(id(3),9);assert.equal(state.inventory,null);assert.notEqual(state.phase,'ready');await workspace.save(id(3),9);assert.equal(writes,1);
  }
});
test('public stock adapter accepts only capped purchase limits; missing schema stays unknown and other failures close',async()=>{
  assert.equal(await readProductStock({rpc:async()=>({error:{code:'PGRST202'}})},[id(3)]),null);
  const valid=await readProductStock({rpc:async(name,args)=>{assert.equal(name,'get_product_stock');assert.deepEqual(args,{p_variant_ids:[id(3)]});return{data:[{variant_id:id(3),max_quantity:6}]};}},[id(3)]);assert.equal(valid.get(id(3)),6);
  for(const data of [[{variant_id:id(9),max_quantity:1}],[{variant_id:id(3),max_quantity:100}],[{variant_id:id(3),max_quantity:-1}],[{variant_id:id(3),max_quantity:1},{variant_id:id(3),max_quantity:2}]])await assert.rejects(readProductStock({rpc:async()=>({data})},[id(3)]));
  await assert.rejects(readProductStock({rpc:async()=>({error:{code:'42501'}})},[id(3)]));
});
test('inventory defaults to English and unsupported languages fall back to the reviewed English dictionary',()=>{
  assert.equal(inventoryCopy().language,'en');assert.equal(inventoryCopy('hi').language,'en');assert.equal(inventoryCopy('en').title,'Product inventory');
});
