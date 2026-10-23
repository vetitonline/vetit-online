import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSellerProducts} from '../src/lib/seller/workspace.js';
import {filterNativeSellerCatalogue,createNativeSellerCatalogue} from '../mobile/src/seller-catalogue.js';
import {sellerCatalogueCopy} from '../src/lib/seller/catalogue-copy.js';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const categories=[{id:id(8),label:'Dog Food',species:[]}];
const titles=['Large корм','தமிழ் உணவு','Cafe\u0301 Feed','ＦＥＥＤ'];
const products=titles.map((title,i)=>({id:id(20+i),businessId:id(i%2+2),status:['draft','rejected','published','submitted'][i],revision:'1',editable:i<2,imageCount:0,updatedAt:'2026-10-22T10:00:00Z',fields:{title,description:'',category_id:id(8),base_amount_minor:'100',species_ids:[id(9)],variant_sku:[],variant_name:[],variant_value:[],variant_amount_minor:[]}}));
const webRows=products.map(p=>({id:p.id,title:p.fields.title,categoryName:'Dog Food',business_id:p.businessId,moderation_status:p.status}));
test('web and native catalogue finders share title/category, status, business and Unicode matching',()=>{
 for(const filters of [{},{query:'food large'},{query:' உணவு தமிழ் '},{query:'Café'},{query:'feed'},{status:'rejected',business:id(3)},{status:'published',query:'dog'},{business:id(99)},{query:'not present'}]){
  assert.deepEqual(filterNativeSellerCatalogue(products,categories,filters).map(p=>p.id),filterSellerProducts(webRows,filters).map(p=>p.id));
 }
 assert.deepEqual(filterSellerProducts(webRows,{query:'food large'}).map(p=>p.id),[id(20)]);
 assert.deepEqual(filterSellerProducts(webRows,{query:'Café'}).map(p=>p.id),[id(22)]);
 assert.deepEqual(filterSellerProducts(webRows,{query:'feed'}).map(p=>p.id),[id(22),id(23)]);
 assert.deepEqual(filterSellerProducts(webRows,{query:'உணவு தமிழ்'}).map(p=>p.id),[id(21)]);
 const frozen=JSON.stringify(products);assert.equal(filterNativeSellerCatalogue(products,categories)[0],products[0]);assert.equal(JSON.stringify(products),frozen);
});
test('unknown status/business cannot broaden results; regional combining marks are preserved',()=>{
 assert.deepEqual(filterSellerProducts(webRows,{status:'admin'}),[]);
 assert.deepEqual(filterSellerProducts(webRows,{business:'other'}),[]);
 assert.deepEqual(filterSellerProducts(webRows,{query:'உணவ'}),[webRows[1]]);
 assert.deepEqual(filterSellerProducts([{...webRows[0],title:'कि'}],{query:'की'}),[]);
 assert.equal(sellerCatalogueCopy('ur').search,sellerCatalogueCopy('en').search);
 assert.notEqual(sellerCatalogueCopy('hi-IN').search,sellerCatalogueCopy('en').search);
});
function mount(){
 let owner=id(1),writes=0;const listeners=new Set();
 const session={snapshot:()=>owner?{userId:owner}:null,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getSession:async()=>({userId:owner,accessToken:'synthetic-only'})};
 const data={businesses:[{id:id(2),name:'First seller'},{id:id(3),name:'Second seller'}],animals:[{id:id(9),label:'Dog'}],categories,products};
 const ui=mountNativeComponent('NativeSellerCatalogue.tsx','NativeSellerCatalogue',{session,apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'},
 {'./seller-catalogue.js':{filterNativeSellerCatalogue,createNativeSellerCatalogue:options=>createNativeSellerCatalogue({...options,request:async input=>{if(input.command)writes++;return data;}})},'../../src/lib/seller/catalogue-copy.js':{sellerCatalogueCopy},'../../src/lib/supabase/test-endpoints.js':{resolveMobileApiBase}});
 return{ui,writes:()=>writes,signOut:()=>{owner=null;for(const fn of listeners)fn(null);}};
}
test('actual native finder applies combined filters, exposes empty state, and clears without writes',async()=>{
 const {ui,writes}=mount();await drainNativeTasks();ui.render();assert.ok(ui.button('Edit draft: Large корм'));
 ui.input('Search your listings','தமிழ்');assert.equal(ui.button('Edit draft: Large корм'),undefined);assert.ok(ui.button('Edit draft: தமிழ் உணவு'));
 ui.button('Draft').props.onPress();ui.render();assert.match(ui.text(),/No listings match/);
 ui.button('Clear filters').props.onPress();ui.render();ui.button('Second seller').props.onPress();ui.render();assert.equal(ui.button('Edit draft: Large корм'),undefined);assert.ok(ui.button('Edit draft: தமிழ் உணவு'));
 assert.equal(writes(),0);ui.unmount();
});
test('editing locks finder controls and preserves form values; sign-out clears query and listings',async()=>{
 const {ui,signOut,writes}=mount();await drainNativeTasks();ui.render();ui.input('Search your listings','large');
 ui.button('Edit draft: Large корм').props.onPress();ui.render();ui.input('Product name','Unsaved draft');
 assert.equal(ui.button('Clear filters').props.disabled,true);ui.button('Clear filters').props.onPress();ui.render();
 assert.equal(ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Search your listings').props.value,'large');
 assert.equal(ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product name').props.value,'Unsaved draft');
 assert.equal(writes(),0);signOut();ui.render();assert.ok(!ui.text().includes('Unsaved draft'));assert.ok(!ui.nodes().some(n=>n.type==='TextInput'));ui.unmount();
});
