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
function mount(initial=[]){
  let stored=JSON.stringify(initial);const list=new Node(),status=new Node(),card=new Node(),button=new Node();
  card.dataset={productId:id,productTitle:'Harness',productPricePaise:'12500',productCategory:'Accessories',productSeller:'Seller',productImage:''};button.closest=()=>card;
  const nodes={'[data-cart-items]':list,'[data-cart-status]':status,'[data-cart-empty]':new Node(),'[data-cart-summary]':new Node(),'[data-cart-subtotal]':new Node()};
  const document={addEventListener(_name,fn){fn();},querySelector:name=>nodes[name]??null,querySelectorAll:name=>name==='[data-add-to-cart]'?[button]:[],createElement:()=>new Node()};
  vm.runInNewContext(fs.readFileSync(new URL('../script.js',import.meta.url),'utf8'),{document,window:{localStorage:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}},location:{href:'https://test.invalid/products/harness'}},URL,Intl});
  return{card,list,status,read:()=>JSON.parse(stored),add:()=>button.events.click(),action(index,action){const row=list.children[index];const target={dataset:{cartAction:action},closest:()=>row};list.events.click({target:{closest:()=>target}});}};
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
