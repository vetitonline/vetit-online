import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as navigation from '../src/lib/marketplace/category-navigation.js';
import {parseCatalogParams,filterCatalogProducts} from '../src/lib/marketplace/catalog-contract.js';
import {discoveryImagePath} from '../src/lib/marketplace/discovery-images.js';
import {mountNativeComponent} from './native-component-harness.mjs';
const animals=[{id:'dog',slug:'dogs',label:'Dogs'},{id:'cat',slug:'cats',label:'Cats'},{id:'cow',slug:'cattle',label:'Cattle'}];
const category=(id,parentId,species)=>({id,slug:id,label:id,parentId,species,sortOrder:0});
const categories=[category('pet-essentials',null,[]),category('food','pet-essentials',[]),category('dog-food','food',['dog']),category('cat-food','food',['cat']),category('cattle-feed',null,['cow'])];
const taxonomy={animals,categories};

test('species scope includes admin ancestors while excluding foreign sibling categories',()=>{
 assert.deepEqual(navigation.categoriesForSpecies(categories,'dog').map(x=>x.id),['pet-essentials','food','dog-food']);
 const tree=navigation.categoryNavigation(categories,'dog','food');
 assert.deepEqual(tree.breadcrumbs.map(x=>x.id),['pet-essentials','food']);
 assert.deepEqual(tree.children.map(x=>x.id),['dog-food']);
 assert.equal(navigation.categoriesForSpecies(categories,'unknown').length,0);
 assert.deepEqual(navigation.categoriesForSpecies(categories),categories);
});
test('web/mobile parser accepts ancestor browsing and rejects unrelated species categories',()=>{
 for(const slug of ['pet-essentials','food','dog-food']){
  const parsed=parseCatalogParams(new URLSearchParams({animal:'dogs',category:slug}),taxonomy);
  assert.equal(parsed.invalid,false);assert.ok(parsed.categoryIds.includes('dog-food'));
 }
 assert.equal(parseCatalogParams(new URLSearchParams({animal:'dogs',category:'cat-food'}),taxonomy).invalid,true);
 const parent=parseCatalogParams(new URLSearchParams({animal:'dogs',category:'pet-essentials'}),taxonomy);
 const product=(id,categoryId,species)=>({id,title:id,description:'',categoryId,species,priceMinor:100});
 assert.deepEqual(filterCatalogProducts([product('dog','dog-food',['dogs']),product('cat','cat-food',['cats'])],parent).map(x=>x.id),['dog']);
});
test('livestock alias resolves without overriding an explicitly configured species',()=>{
 const params=new URLSearchParams({animal:'livestock',category:'cattle-feed'});
 assert.equal(parseCatalogParams(params,taxonomy).animal.id,'cow');
 assert.equal(parseCatalogParams(params,taxonomy).invalid,false);
 assert.equal(parseCatalogParams(new URLSearchParams({animal:'missing'}),taxonomy).invalid,true);
 const own={id:'other',slug:'livestock',label:'Configured livestock'};
 assert.equal(parseCatalogParams(new URLSearchParams({animal:'livestock'}),{...taxonomy,animals:[...animals,own]}).animal.id,'other');
});
test('actual web taxonomy adapter and shared navigation return the same species scope',()=>{
 const source=fs.readFileSync(new URL('../src/lib/marketplace/product-taxonomy.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('require','exports',compiled)(name=>{assert.equal(name,'./category-navigation.js');return navigation;},exports);
 assert.deepEqual(exports.categoriesForAnimal(categories,animals[0]),navigation.categoriesForSpecies(categories,'dog'));
 const cyclic=[category('a','b',['dog']),category('b','a',[])];
 assert.equal(navigation.categoriesForSpecies(cyclic,'dog').length,2);
 assert.ok(navigation.categoryNavigation(cyclic,'dog','a').breadcrumbs.length<=2);
});
test('shared discovery images use real existing assets and safe neutral fallbacks',()=>{
 for(const [slug,file] of [['dogs','dog'],['cats','cat'],['birds','bird'],['fish','fish'],['cattle','livestock'],['livestock','livestock'],['unknown','essentials'],['__proto__','essentials']]){
  const image=discoveryImagePath(slug);assert.equal(image,`/images/discovery/${file}.webp`);
  const bytes=fs.readFileSync(new URL('../public'+image,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});
test('native species cards preserve taxonomy, scoped category text and selection callbacks',()=>{
 const selected=[];const props={animals:[animals[0]],categories,imageBaseUrl:'http://localhost:4321/',selectedSlug:'dogs',onSelect:value=>selected.push(value)};
 const modules={'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},'../../src/lib/marketplace/category-navigation.js':navigation,'../../src/lib/marketplace/discovery-images.js':{discoveryImagePath},'./ProductPhoto':{ProductPhoto:'ProductPhoto'}};
 const ui=mountNativeComponent('SpeciesDiscovery.tsx','SpeciesDiscovery',props,modules);
 const button=ui.nodes().find(n=>n.type==='Pressable');assert.equal(button.props.accessibilityState.selected,true);
 button.props.onPress();assert.equal(selected[0],animals[0]);
 assert.equal(ui.nodes().find(n=>n.type==='ProductPhoto').props.uri,'http://localhost:4321/images/discovery/dog.webp');
 assert.match(ui.text(),/dog-food/);assert.ok(!ui.text().includes('cat-food'));
 props.animals=[];ui.render();assert.equal(ui.nodes().some(n=>n.type==='Pressable'),false);
});
