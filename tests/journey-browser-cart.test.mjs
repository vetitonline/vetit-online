import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const id='10000000-0000-4000-8000-000000000001',variant='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
class Node {
  constructor(){this.children=[];this.dataset={};this.events={};this.textContent='';}
  append(...values){this.children.push(...values);}
  replaceChildren(){this.children=[];}
  setAttribute(){}
  addEventListener(name,callback){this.events[name]=callback;}
}
function mount(initial=[], { storageFails = false } = {}){
  let stored=JSON.stringify(initial);const list=new Node(),status=new Node(),card=new Node(),button=new Node();
  card.dataset={productId:id,productTitle:'Harness',productPricePaise:'12500',productCategory:'Accessories',productSeller:'Seller',productImage:''};button.closest=()=>card;
  const nodes={'[data-cart-clear]':new Node(),'[data-cart-items]':list,'[data-cart-status]':status,'[data-cart-empty]':new Node(),'[data-cart-summary]':new Node(),'[data-cart-subtotal]':new Node()};
  const document={addEventListener(_name,fn){fn();},querySelector:name=>nodes[name]??null,querySelectorAll:name=>name==='[data-add-to-cart]'?[button]:[],createElement:()=>new Node()};
  const events = {}, storage = {getItem:()=>stored,setItem:(_key,value)=>{if(storageFails) throw Error('Storage blocked'); stored=value;}};
  vm.runInNewContext(fs.readFileSync(new URL('../script.js',import.meta.url),'utf8'),{document,window:{addEventListener:(name,fn)=>{events[name]=fn;},localStorage:storage,location:{href:'https://test.invalid/products/harness'}},URL,Intl});
  return{card,list,status,replace:items=>{stored=JSON.stringify(items);},sync:(key='vetit-cart-v1',storageArea=storage)=>events.storage({key,storageArea}),clear:()=>nodes['[data-cart-clear]'].events.click(),read:()=>JSON.parse(stored),add:()=>button.events.click(),action(index,action){const row=list.children[index];const target={dataset:{cartAction:action},closest:()=>row};list.events.click({target:{closest:()=>target}});}};
}
test('actual browser-cart handler keeps sizes/colours separate and preserves legacy base items',()=>{
  const ui=mount([{id,title:'Legacy base',quantity:1,pricePaise:10000}]);
  ui.card.dataset.productVariantId=variant;ui.card.dataset.productOptionLabel='Size M · Blue';ui.card.dataset.productQuantity='2';ui.add();
  ui.card.dataset.productVariantId=other;ui.card.dataset.productOptionLabel='Size L · Red';ui.card.dataset.productQuantity='1';ui.add();
  assert.equal(ui.read().length,3);assert.equal(ui.read()[1].quantity,2);assert.equal(ui.read()[2].productVariantId,other);
  ui.action(1,'increase');assert.equal(ui.read()[1].quantity,3);assert.equal(ui.read()[2].quantity,1);
  ui.action(2,'remove');assert.equal(ui.read().length,2);assert.equal(ui.read()[0].title,'Legacy base');
});
test('browser cart refuses invalid quantities, unknown prices and aggregate option quantities above 99',()=>{
  const ui=mount();ui.card.dataset.productVariantId=variant;ui.card.dataset.productQuantity='99';ui.add();assert.equal(ui.read()[0].quantity,99);
  ui.card.dataset.productQuantity='1';ui.add();assert.equal(ui.read()[0].quantity,99);assert.match(ui.status.textContent,/99/);
  ui.card.dataset.productVariantId=other;ui.card.dataset.productQuantity='0';ui.add();assert.equal(ui.read().length,1);
  ui.card.dataset.productQuantity='1';ui.card.dataset.productPricePaise='';ui.add();assert.equal(ui.read().length,1);
});

test('quantity increase at 99 gives clear feedback without changing the cart',()=>{
  const ui=mount([{id,title:'Harness',quantity:99,pricePaise:12500}]);
  ui.action(0,'increase');
  assert.equal(ui.read()[0].quantity,99);
  assert.match(ui.status.textContent,/at most 99 units/);
});
test('cart edit warns when browser storage cannot persist the change',()=>{
  const ui=mount([{id,title:'Harness',quantity:2,pricePaise:12500}],{storageFails:true});
  ui.action(0,'decrease');
  assert.equal(ui.read()[0].quantity,2);
  assert.match(ui.status.textContent,/browser storage is unavailable/);
});

test('stale quantity and removal commands cannot overwrite another page cart',()=>{
  for(const action of ['increase','decrease','remove']) {
    const ui=mount([{id,title:'Harness',quantity:2,pricePaise:12500}]);
    ui.replace([{id,title:'Harness',quantity:7,pricePaise:12500}]);
    ui.action(0,action);
    assert.equal(ui.read()[0].quantity,7);
    assert.match(ui.status.textContent,/changed in another page/);
    ui.action(0,'increase');assert.equal(ui.read()[0].quantity,8);
  }
});
test('stale additions and clear require review without losing persisted selections',()=>{
  for(const action of ['add','clear']) {
    const ui=mount();ui.replace([{id:other,title:'Other',quantity:3,pricePaise:100}]);
    ui[action]();assert.equal(ui.read()[0].id,other);assert.equal(ui.read()[0].quantity,3);
    assert.match(ui.status.textContent,/changed in another page/);
  }
});
test('storage events refresh rendered quantities and removals without writing',()=>{
  const ui=mount([{id,title:'Harness',quantity:2,pricePaise:12500}]);
  ui.replace([{id,title:'Harness',quantity:5,pricePaise:12500}]);ui.sync();
  ui.action(0,'decrease');assert.equal(ui.read()[0].quantity,4);
  ui.replace([]);ui.sync(null);assert.equal(ui.list.children.length,0);
});
test('unrelated storage events do not invalidate the displayed cart',()=>{
  const ui=mount([{id,title:'Harness',quantity:2,pricePaise:12500}]);
  ui.replace([]);ui.sync('unrelated');assert.equal(ui.list.children.length,1);
  ui.sync('vetit-cart-v1',{});assert.equal(ui.list.children.length,1);
});
test('failed clear never claims persisted removal',()=>{
  const ui=mount([{id,title:'Harness',quantity:2,pricePaise:12500}],{storageFails:true});
  ui.clear();assert.equal(ui.read().length,1);assert.equal(ui.list.children.length,0);
  assert.match(ui.status.textContent,/browser storage is unavailable/);
});
