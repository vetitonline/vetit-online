import test from 'node:test';
import assert from 'node:assert/strict';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
import {createNativeSellerCatalogue,filterNativeSellerCatalogue} from '../mobile/src/seller-catalogue.js';
import {sellerCatalogueCopy} from '../src/lib/seller/catalogue-copy.js';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),business=id(2),listing=id(3),category=id(4),animal=id(5);
const copy=sellerCatalogueCopy();
function fixture(open=async()=>{}){
 let owner=user,writes=0;const listeners=new Set(),links=[];
 const session={snapshot:()=>owner?{userId:owner}:null,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getSession:async()=>({userId:owner,accessToken:'synthetic-token-not-for-link'})};
 let data={businesses:[{id:business,name:'Seller'}],animals:[{id:animal,label:'Dog'}],categories:[{id:category,label:'Feed',species:[animal]}],products:[{id:listing,businessId:business,status:'draft',updatedAt:'2026-10-24T09:00:00Z',revision:'1',editable:true,imageCount:0,fields:{title:'Original feed',description:'',category_id:category,base_amount_minor:'100',species_ids:[animal],variant_sku:[],variant_name:[],variant_value:[],variant_amount_minor:[]}}]};
 const ui=mountNativeComponent('NativeSellerCatalogue.tsx','NativeSellerCatalogue',{session,apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'},
 {'./seller-catalogue.js':{filterNativeSellerCatalogue,createNativeSellerCatalogue:options=>createNativeSellerCatalogue({...options,request:async input=>{
  if(input.command){writes++;data={...data,products:[{...data.products[0],revision:'2',fields:input.command.fields}]};return{listingId:listing,revision:'2'};}return data;
 }})},'../../src/lib/seller/catalogue-copy.js':{sellerCatalogueCopy},'../../src/lib/supabase/test-endpoints.js':{resolveMobileApiBase}},
 {Linking:{openURL:url=>{links.push(url);return open(url);}}});
 return{ui,links,writes:()=>writes,signOut:()=>{owner=null;for(const fn of listeners)fn(null);}};
}
const ready=async f=>{await drainNativeTasks();f.ui.render();};
const edit=f=>{f.ui.button('Edit draft: Original feed').props.onPress();f.ui.render();f.ui.input(copy.name,'Unsaved feed');};
const name=f=>f.ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===copy.name)?.props.value;

test('dirty handoff offers save/discard guidance without launching or changing edits',async()=>{
 const f=fixture();await ready(f);edit(f);f.ui.button(copy.online).props.onPress();f.ui.render();
 assert.equal(f.links.length,0);assert.equal(name(f),'Unsaved feed');assert.match(f.ui.text(),/Review draft save/);
 f.ui.button(copy.handoffKeep).props.onPress();f.ui.render();assert.equal(name(f),'Unsaved feed');assert.equal(f.writes(),0);f.ui.unmount();
});
test('failed discard-and-open preserves edits, redacts errors and requires another explicit discard',async()=>{
 let fail=true;const f=fixture(async()=>{if(fail)throw Error('PRIVATE_PLATFORM_ERROR synthetic-token-not-for-link');});await ready(f);edit(f);
 f.ui.button(copy.photos+': Original feed').props.onPress();f.ui.render();f.ui.button(copy.handoffDiscard).props.onPress();await ready(f);
 assert.equal(name(f),'Unsaved feed');assert.match(f.ui.text(),/could not be opened/);assert.ok(!f.ui.text().includes('PRIVATE_PLATFORM_ERROR'));assert.equal(f.ui.button(copy.handoffRetry),undefined);
 fail=false;f.ui.button(copy.handoffDiscard).props.onPress();await ready(f);assert.equal(name(f),undefined);assert.equal(f.links.length,2);assert.ok(f.links.every(url=>url==='http://localhost:4321/seller/products/'+listing));assert.equal(f.writes(),0);f.ui.unmount();
});
test('clean failed handoff exposes actionable retry and coalesces duplicate opening taps',async()=>{
 let reject,resolve;const f=fixture(()=>new Promise((ok,no)=>{resolve=ok;reject=no;}));await ready(f);
 const open=f.ui.button(copy.online).props.onPress;open();open();f.ui.render();assert.equal(f.links.length,1);assert.equal(f.ui.button(copy.online).props.disabled,true);
 reject(Error('private error'));await ready(f);assert.ok(f.ui.button(copy.handoffRetry));f.ui.button(copy.handoffRetry).props.onPress();f.ui.render();assert.equal(f.links.length,2);resolve();await ready(f);
 assert.equal(f.ui.button(copy.handoffRetry),undefined);assert.ok(f.links.every(url=>!url.includes('token')&&!url.includes('?')));f.ui.unmount();
});
test('saving a blocked handoff uses existing confirmation and never automatically leaves the app',async()=>{
 const f=fixture();await ready(f);edit(f);f.ui.button(copy.photos+': Original feed').props.onPress();f.ui.render();
 f.ui.button(copy.save).props.onPress();f.ui.render();assert.equal(f.links.length,0);f.ui.button(copy.apply).props.onPress();await ready(f);await ready(f);
 assert.equal(f.writes(),1);assert.equal(f.links.length,0);assert.ok(f.ui.button(copy.handoffOpen));f.ui.button(copy.handoffOpen).props.onPress();await ready(f);assert.equal(f.links.length,1);f.ui.unmount();
});
test('background/sign-out/unmount invalidate pending launch results without restoring private state',async()=>{
 for(const invalidate of [f=>f.ui.appState('background'),f=>f.signOut(),f=>f.ui.unmount()]){
  let reject;const f=fixture(()=>new Promise((_,no)=>{reject=no;}));await ready(f);edit(f);f.ui.button(copy.online).props.onPress();f.ui.render();f.ui.button(copy.handoffDiscard).props.onPress();f.ui.render();
  invalidate(f);reject(Error('late private failure'));await ready(f);assert.ok(!f.ui.text().includes('could not be opened'));assert.ok(!f.ui.text().includes('Unsaved feed'));assert.equal(f.writes(),0);f.ui.unmount();
 }
});
test('handoff copy preserves English regional fallback and reviewed Hindi messages',()=>{
 assert.equal(sellerCatalogueCopy('ta').handoffFailed,copy.handoffFailed);assert.notEqual(sellerCatalogueCopy('hi-IN').handoffSave,copy.handoffSave);
 assert.match(copy.handoffSave,/backgrounding/);assert.match(copy.handoffSignin,/separate sign-in/);
});
test('selecting another editor dismisses a failed target rather than retrying an old website destination',async()=>{
 const f=fixture(async()=>{throw Error('synthetic launcher failure');});await ready(f);f.ui.button(copy.online).props.onPress();await ready(f);assert.ok(f.ui.button(copy.handoffRetry));
 f.ui.button('Edit draft: Original feed').props.onPress();f.ui.render();assert.equal(f.ui.button(copy.handoffRetry),undefined);assert.equal(name(f),'Original feed');assert.equal(f.links.length,1);f.ui.unmount();
});
