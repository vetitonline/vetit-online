// Read-only synthetic fixtures only; no database, network or customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as contract from '../src/lib/marketplace/catalog-contract.js';
import * as links from '../src/lib/marketplace/shop-navigation.js';
import * as navigation from '../src/lib/marketplace/category-navigation.js';
import {fetchCatalog} from '../src/lib/marketplace/catalog-client.js';
const taxonomy={state:'available',animals:[{id:'dog',slug:'dogs',label:'Dogs'},{id:'cat',slug:'cats',label:'Cats'},{id:'cow',slug:'cattle',label:'Cattle'}],categories:[{id:'food',slug:'food',label:'Food',parentId:null,species:['dog','cat']},{id:'dog-food',slug:'dog-food',label:'Dog Food',parentId:'food',species:['dog']},{id:'dry',slug:'dry',label:'Dry Feed',parentId:'dog-food',species:['dog']}]};
const rows=Array.from({length:35},(_,n)=>({id:`10000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,slug:`synthetic-${n}`,title:'Synthetic feed '+n,description:'Offline fixture',category:n<31?'Dry Feed':'Food',categoryId:n<31?'dry':'food',categorySlug:n<31?'dry':'food',species:[n<31?'dogs':'cats'],sellerName:'Synthetic seller',brand:null,priceMinor:10000+n,priceIsFrom:false,currencyCode:'INR',imageUrl:null,imageAlt:null}));
function compile(file,modules){const output=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',output)(name=>{assert.ok(name in modules,name);return modules[name];},exports);return exports;}
function fixture(){let state='available',taxState='available',calls=0,productRows=rows;
 const reader=compile('src/lib/marketplace/catalog-reader.ts',{'./catalog-contract.js':contract,'./featured-products':{getProductTaxonomy:async()=>taxState!=='available'?{state:taxState,animals:[],categories:[]}:taxonomy,getMarketplaceProducts:async()=>{calls++;return{state,products:state==='available'?productRows:[]};}}});
 return{reader,calls:()=>calls,setState:s=>{state=s;},setTaxState:s=>{taxState=s;},setRows:r=>{productRows=r;}};
}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function mount(kind,f,query='',animal='dogs',category='dog-food'){
 const file=kind==='species'?'src/pages/shop/[animal]/index.astro':'src/pages/shop/[animal]/[category].astro';
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').split('---')[1];const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const Astro={request:new Request('http://localhost:4321/shop/'+animal+(kind==='category'?'/'+category:'')+query),url:new URL('http://localhost:4321/shop/'+animal+query),params:{animal,...(kind==='category'?{category}:{})},cookies:{},response:{status:200},redirect:(path,status)=>new Response(null,{status,headers:{location:path}})};
 const modules={'../../../lib/marketplace/catalog-reader':f.reader,'../../../lib/marketplace/shop-navigation.js':links,'../../../lib/marketplace/product-taxonomy':{findAnimal:(animals,slug)=>animals.find(a=>a.slug===slug)??(slug==='livestock'?animals.find(a=>a.slug==='cattle'):undefined),findCategory:(categories,slug)=>categories.find(c=>c.slug===slug),categoriesForAnimal:(categories,animal)=>navigation.categoriesForSpecies(categories,animal.id)}};
 const result=await new AsyncFunction('require','exports','Astro',code+`;return {animal,category:typeof category==='undefined'?null:category,products,result,params};`)(name=>{if(name.endsWith('.css')||name.endsWith('.astro'))return{};assert.ok(name in modules,name);return modules[name];},{},Astro);
 return result instanceof Response?{Astro,redirect:result}:{Astro,...result};
}
test('route-owned species/category cannot be replaced by query scope or product shortcuts',()=>{
 const query=new URLSearchParams('animal=cats&category=food&product=synthetic-1&q=feed&page=2');
 const scoped=links.shopCatalogParams(query,'dogs','dog-food');assert.equal(scoped.get('animal'),'dogs');assert.equal(scoped.get('category'),'dog-food');assert.equal(scoped.has('product'),false);assert.equal(query.get('animal'),'cats');
 assert.equal(links.shopCatalogParams(query,'dogs').has('category'),false);
 const href=links.buildShopCatalogUrl('dogs','dry',query);const url=new URL(href,'http://localhost');assert.equal(url.pathname,'/shop/dogs/dry');assert.equal(url.searchParams.get('q'),'feed');assert.equal(url.searchParams.has('page'),false);assert.equal(url.searchParams.has('product'),false);
});
test('species landing uses shared clamped pagination and preserves its authorized category/image records',async()=>{
 const f=fixture(),page=await mount('species',f,'?page=999&pageSize=10&animal=cats&product=synthetic-34');assert.equal(page.products.length,1);assert.equal(page.result.pagination.page,4);assert.equal(page.result.pagination.total,31);assert.ok(page.products.every(p=>p.species.includes('dogs')));assert.equal(f.calls(),1);
 assert.deepEqual(page.result.taxonomy.categories,taxonomy.categories);assert.equal(page.products[0].imageUrl,null);
});
test('category landing includes descendants and matches the mobile shared API contract',async()=>{
 const f=fixture(),page=await mount('category',f,'?q=feed&min=100&max=200&sort=name&pageSize=10&page=2&animal=cats&category=food');
 const params=links.shopCatalogParams(new URLSearchParams('q=feed&min=100&max=200&sort=name&pageSize=10&page=2'),'dogs','dog-food');
 const mobile=await fetchCatalog({animal:'dogs',category:'dog-food',query:'feed',minPriceRupees:100,maxPriceRupees:200,sort:'name',pageSize:10,page:2},{fetchImpl:async()=>Response.json((await f.reader.readPublicCatalog(page.Astro.request,{},params)).body)});
 assert.deepEqual(page.products,mobile.products);assert.deepEqual(page.result.pagination,mobile.pagination);assert.equal(page.products.length,10);assert.ok(page.products.every(p=>p.categoryId==='dry'));
 const next=new URL(links.buildShopCatalogUrl('dogs','dog-food',page.params,3),'http://localhost');for(const key of ['q','min','max','sort','pageSize'])assert.equal(next.searchParams.get(key),page.params.get(key));assert.equal(next.searchParams.get('page'),'3');
});
test('unknown/incompatible routes preserve the /shop redirect without querying products; invalid filters are 400',async()=>{
 for(const [animal,category] of [['missing','dog-food'],['cats','dog-food']]){const f=fixture(),page=await mount('category',f,'',animal,category);assert.equal(page.redirect.status,302);assert.equal(page.redirect.headers.get('location'),'/shop');assert.equal(f.calls(),0);}
 const f=fixture(),page=await mount('species',f,'?min=200&max=100');assert.equal(page.Astro.response.status,400);assert.equal(page.result.state,'invalid_request');assert.deepEqual(page.products,[]);assert.equal(f.calls(),0);
});
test('outages render unavailable without false missing-category redirects; empty and unconfigured remain distinct',async()=>{
 for(const kind of ['species','category']){const f=fixture();f.setTaxState('error');const page=await mount(kind,f);assert.equal(page.redirect,undefined);assert.equal(page.Astro.response.status,503);assert.equal(page.result.state,'error');assert.equal(f.calls(),0);}
 const f=fixture();f.setState('unconfigured');assert.equal((await mount('species',f)).result.state,'unconfigured');f.setState('available');f.setRows([]);assert.equal((await mount('category',f)).result.pagination.total,0);
});
test('livestock alias resolves through the shared species contract and remains canonical in navigation',async()=>{
 const f=fixture(),page=await mount('species',f,'','livestock');assert.equal(page.animal.slug,'cattle');assert.equal(page.result.filters.animal,'cattle');assert.equal(links.buildShopCatalogUrl(page.animal.slug),'/shop/cattle');
});
test('missing configuration is not mistaken for unknown taxonomy and stays compatible with mobile',async()=>{
 for(const kind of ['species','category']){const f=fixture();f.setTaxState('unconfigured');const page=await mount(kind,f);assert.equal(page.redirect,undefined);assert.equal(page.result.state,'unconfigured');assert.deepEqual(page.products,[]);assert.equal(f.calls(),0);
 const mobile=await fetchCatalog({animal:'dogs',category:'dog-food'},{fetchImpl:async()=>Response.json((await f.reader.readPublicCatalog(page.Astro.request,{},new URLSearchParams('animal=dogs&category=dog-food'))).body)});assert.equal(mobile.state,'unconfigured');}
});
