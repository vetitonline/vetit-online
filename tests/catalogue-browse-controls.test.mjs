import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {catalogPriceRange,parseCatalogParams} from '../src/lib/marketplace/catalog-contract.js';
import {categoryDiscoveryArt,discoveryImagePath} from '../src/lib/marketplace/discovery-images.js';
const animals=[{id:'dog',slug:'dogs'},{id:'cat',slug:'cats'}];
const categories=[{id:'root',slug:'care',label:'Care',parentId:null,species:[]},{id:'mixed',slug:'food',label:'Food',parentId:'root',species:['dog','cat']},{id:'dog',slug:'dog-food',label:'Dog food',parentId:null,species:['dog']}];
test('shared price feedback agrees with API parsing for empty, decimal, zero, inverted and invalid bounds',()=>{
 for(const [min,max,field] of [['','',null],['0','0',null],['1.25','2.50',null],['10','2','max'],['-1','','min'],['','Infinity','max'],['NaN','','min'],['999999999999999','','min']]){
  const range=catalogPriceRange(min,max);assert.equal(range.issue?.field??null,field);
  const parsed=parseCatalogParams(new URLSearchParams({min,max}),{animals,categories});assert.equal(parsed.invalid,Boolean(field));
  if(!field){assert.equal(parsed.minPrice,range.minPrice);assert.equal(parsed.maxPrice,range.maxPrice);}
 }
 assert.equal(catalogPriceRange('1.25','2.50').minPrice,125);
});
test('category imagery follows species including descendants; mixed, cyclic and unknown categories stay safe',()=>{
 assert.equal(categoryDiscoveryArt(categories[0],categories,animals),'essentials');
 assert.equal(categoryDiscoveryArt(categories[2],categories,animals),'dogs');
 const cycle=[{id:'a',parentId:'b',species:[]},{id:'b',parentId:'a',species:['cat']}];
 assert.equal(categoryDiscoveryArt(cycle[0],cycle,animals),'cats');
 assert.equal(discoveryImagePath(categoryDiscoveryArt({id:'missing'},categories,animals)),'/images/discovery/essentials.webp');
});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function discovery(file){
 const code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').split('---')[1],{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const adapter={getProductTaxonomy:async()=>({state:'available',animals,categories}),getFeaturedProducts:async()=>({state:'available',products:[]})};
 return new AsyncFunction('require','exports','Astro',code+`;return typeof categoryHref==='undefined'?{visualGroups}:{categoryHref};`)(name=>{
  if(name.includes('featured-products'))return adapter;
  if(name.includes('discovery-images'))return {categoryDiscoveryArt};
  return {};
 },{},{request:{},cookies:{}});
}
test('actual shop discovery category links do not silently choose the first assigned species',async()=>{
 const {categoryHref}=await discovery('src/pages/shop/index.astro');
 for(const category of categories){const url=new URL(categoryHref(category),'http://localhost');assert.equal(url.pathname,'/products');assert.equal(url.searchParams.get('category'),category.slug);assert.equal(url.searchParams.has('animal'),false);}
 const home=fs.readFileSync(new URL('../src/pages/index.astro',import.meta.url),'utf8');assert.ok(!home.includes('taxonomy.animals.find((item) => category.species.includes(item.id))'));
});
test('actual homepage visual categories use the same existing editorial assets as native',async()=>{
 const {visualGroups}=await discovery('src/pages/index.astro');assert.equal(visualGroups[0].image,'essentials');assert.equal(visualGroups[1].image,'dogs');
 for(const group of visualGroups)assert.ok(fs.existsSync(new URL('../public'+discoveryImagePath(group.image),import.meta.url)));
});
