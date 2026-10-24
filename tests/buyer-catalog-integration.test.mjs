// Explicit synthetic read-only fixtures. No network, accounts or live product data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as contract from '../src/lib/marketplace/catalog-contract.js';
import * as client from '../src/lib/marketplace/catalog-client.js';
import * as navigation from '../src/lib/marketplace/category-navigation.js';
import * as shortcuts from '../src/lib/marketplace/navigation.js';
import * as cart from '../src/lib/marketplace/preview-cart.js';
import * as copy from '../src/lib/marketplace/workspace-copy.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const taxonomy={state:'available',animals:[{id:'dog',slug:'dogs',label:'Dogs'},{id:'cat',slug:'cats',label:'Cats'}],categories:[{id:'root',slug:'food',label:'Food',parentId:null,species:['dog','cat']},{id:'child',slug:'dog-food',label:'Dog Food',parentId:'root',species:['dog']},{id:'leaf',slug:'dry-food',label:'Dry Food',parentId:'child',species:['dog']}]};
const product=n=>({id:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,slug:`synthetic-feed-${n}`,title:`Synthetic fixture feed ${n}`,description:'Offline test fixture only',category:'Dry Food',categorySlug:'dry-food',categoryId:'leaf',species:['dogs'],brand:null,sellerName:'Synthetic seller',priceMinor:10000+n,priceIsFrom:false,currencyCode:'INR',imageUrl:null,imageAlt:null});
function compile(file,modules){const output=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.ok(!output.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error));const exports={};new Function('require','exports',output.outputText)(name=>{assert.ok(name in modules,`Unexpected module ${name}`);return modules[name];},exports);return exports;}
function fixture(){
 let available=Array.from({length:60},(_,i)=>product(i+1)),state='available',taxState='available';const reads=[];
 const adapters={getProductTaxonomy:async()=>({...taxonomy,state:taxState}),getMarketplaceProducts:async(_req,_cookies,limit,options)=>{reads.push({limit,options});return{state,products:state==='available'?available.filter(p=>options.productSlug?p.slug===options.productSlug:options.productId?p.id===options.productId:true).slice(0,limit):[]};}};
 const reader=compile('src/lib/marketplace/catalog-reader.ts',{'./catalog-contract.js':contract,'./featured-products':adapters});
 const api=compile('src/pages/api/catalog/index.ts',{'../../../lib/marketplace/catalog-reader':reader});
 const requests=[];
 const fetchImpl=async url=>{const request=new Request(new URL(url,'http://localhost:4321'));requests.push(request.url);if(new URL(request.url).searchParams.get('page')==='3')available=available.slice(0,30);return api.GET({request,cookies:{}});};
 return{reader,api,reads,requests,fetchImpl,setProducts:p=>{available=p;},setState:s=>{state=s;},setTaxState:s=>{taxState=s;}};
}
test('shared SSR/API/native read contract navigates real taxonomy descendants with one paginated result',async()=>{
 const f=fixture(),url='http://localhost:4321/api/catalog?animal=dogs&category=food&page=999&pageSize=24';
 const ssr=await f.reader.readPublicCatalog(new Request(url),{}),native=await client.fetchCatalog({animal:'dogs',category:'food',page:999,pageSize:24},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});
 assert.deepEqual(ssr.body,native);assert.equal(native.products.length,12);assert.equal(native.pagination.page,3);assert.equal(native.pagination.total,60);assert.equal(f.reads[0].options.taxonomy.categories,taxonomy.categories);assert.equal(f.reads[0].options.marketCode,'IN');
 const href=client.buildProductsUrl({animal:'dogs',category:'dog-food',query:'fixture',pageSize:24});assert.equal(new URL(href,'http://localhost').pathname,'/products');
 assert.equal(contract.parseCatalogParams(new URL(href,'http://localhost').searchParams,taxonomy).category.id,'child');
 assert.deepEqual(navigation.categoryNavigation(taxonomy.categories,'dog','dry-food').breadcrumbs.map(c=>c.slug),['food','dog-food','dry-food']);
});
test('detail reads use exact slug or UUID, unavailable products stay empty, invalid requests skip data reads',async()=>{
 const f=fixture();for(const key of [product(1).id,product(1).slug]){const result=await client.fetchCatalog({product:key,pageSize:1},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.products[0].id,product(1).id);assert.equal(f.reads.at(-1).limit,1);}
 f.setProducts([]);const missing=await client.fetchCatalog({product:'not-published',pageSize:1},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.deepEqual(missing.products,[]);
 const before=f.reads.length;for(const search of ['animal=cats&category=dog-food','product=bad%20key','min=20&max=10']){const response=await f.api.GET({request:new Request('http://localhost:4321/api/catalog?'+search),cookies:{}});assert.equal(response.status,400);}assert.equal(f.reads.length,before);
});
test('unconfigured and error states remain explicit, with no synthetic/live fallback products',async()=>{
 const f=fixture();f.setState('unconfigured');const result=await client.fetchCatalog({},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.state,'unconfigured');assert.deepEqual(result.products,[]);
 f.setTaxState('error');const response=await f.api.GET({request:new Request('http://localhost:4321/api/catalog'),cookies:{}});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('shared response exposes the existing published-listing scan limit instead of claiming complete coverage',async()=>{
 const f=fixture();f.setProducts(Array.from({length:1001},(_,i)=>product(i+1)));const result=await client.fetchCatalog({},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.pagination.truncated,true);assert.equal(result.pagination.total,1000);assert.equal(f.reads[0].limit,1000);
});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function ssrFrontmatter(file,f,url,params={}){
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').split('---')[1];const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const Astro={request:new Request(url),cookies:{},url:new URL(url),params,response:{status:200}};
 const modules={'../lib/marketplace/catalog-reader':f.reader,'../lib/marketplace/catalog-client.js':client,'../lib/marketplace/category-navigation.js':navigation,'../../lib/marketplace/catalog-reader':f.reader,'../../lib/marketplace/catalog-client.js':client,'../../lib/marketplace/featured-products':{formatProductPrice:()=>''}};
 const values=await new AsyncFunction('require','exports','Astro',output+`;return typeof pageProducts==='undefined'?{product,result}:{page,pageCount,pageProducts,tree,browseHref};`)(name=>{if(name.endsWith('.css')||name.endsWith('.astro'))return{};assert.ok(name in modules,name);return modules[name];},{},Astro);
 return{Astro,...values};
}
test('actual website listing frontmatter uses clamped shared pages and filter-preserving category links',async()=>{
 const f=fixture(),page=await ssrFrontmatter('src/pages/products.astro',f,'http://localhost:4321/products?animal=dogs&category=dog-food&page=999&sort=name');
 assert.equal(page.page,3);assert.equal(page.pageProducts.length,12);assert.equal(page.tree.children[0].slug,'dry-food');
 const next=new URL(page.browseHref('dry-food'),'http://localhost:4321');assert.equal(next.searchParams.get('animal'),'dogs');assert.equal(next.searchParams.get('sort'),'name');assert.equal(next.searchParams.has('page'),false);
});
test('actual website detail frontmatter uses shared exact read and returns 404/503 without inventing products',async()=>{
 const f=fixture();const page=await ssrFrontmatter('src/pages/products/[id].astro',f,'http://localhost:4321/products/synthetic-feed-1',{id:'synthetic-feed-1'});assert.equal(page.product.id,product(1).id);
 f.setProducts([]);assert.equal((await ssrFrontmatter('src/pages/products/[id].astro',f,'http://localhost:4321/products/missing',{id:'missing'})).Astro.response.status,404);
 f.setState('error');assert.equal((await ssrFrontmatter('src/pages/products/[id].astro',f,'http://localhost:4321/products/missing',{id:'missing'})).Astro.response.status,503);
});
function mobile(f){
 const components=Object.fromEntries(['ModerationWorkspace','NativeModeration','NativeBuyerOrders','NativeCheckoutReview','NativeAppointments','NativeSellerCatalogue','ProductPhoto','MarketplaceShortcuts','SpeciesDiscovery'].map(name=>['./src/'+name,{[name]:name}]));
 return mountNativeComponent('../App.tsx','default',{}, {...components,'../Vetit-online-transparent.png':'offline-logo','../src/lib/supabase/test-endpoints.js':{resolveMobileApiBase:()=> 'http://localhost:4321'},'../src/lib/marketplace/navigation.js':shortcuts,'../src/lib/marketplace/preview-cart.js':cart,'../src/lib/marketplace/workspace-copy.js':copy,'../src/lib/marketplace/category-navigation.js':navigation,'../src/lib/marketplace/catalog-client':{...client,fetchCatalog:(filters,options)=>client.fetchCatalog(filters,{...options,fetchImpl:f.fetchImpl})},'../src/lib/services/service-client':{},'../src/lib/services/appointment-client.js':{}},{ScrollView:'ScrollView',Image:'Image',StatusBar:'StatusBar',StyleSheet:{create:s=>s}});
}
const settle=async ui=>{await new Promise(resolve=>setTimeout(resolve,15));await drainNativeTasks();ui.render();};
const chip=(ui,label)=>ui.nodes().find(n=>typeof n.type==='function'&&n.type.name==='Chip'&&n.props.label===label);
test('actual native App selects subcategories, opens exact product detail and returns to its category',async()=>{
 const f=fixture(),ui=mobile(f);await settle(ui);ui.button('Explore marketplace').props.onPress();ui.render();await settle(ui);
 chip(ui,'Food').props.onPress();ui.render();await settle(ui);chip(ui,'Dog Food').props.onPress();ui.render();await settle(ui);
 const tile=ui.nodes().find(n=>typeof n.type==='function'&&n.type.name==='ProductTile');tile.props.onPress();ui.render();await settle(ui);
 const detail=ui.nodes().find(n=>typeof n.type==='function'&&n.type.name==='ProductDetail');assert.equal(detail.props.product.id,product(1).id);assert.ok(f.requests.some(url=>new URL(url).searchParams.get('product')==='synthetic-feed-1'));
 detail.props.onCategory();ui.render();await settle(ui);assert.equal(new URL(f.requests.at(-1)).searchParams.get('category'),'dry-food');assert.ok(chip(ui,'Food'));ui.unmount();
});
test('native pagination follows the returned page after the published result set shrinks',async()=>{
 const f=fixture(),ui=mobile(f);await settle(ui);ui.button('Explore marketplace').props.onPress();ui.render();await settle(ui);
 ui.button('Next ›').props.onPress();ui.render();await settle(ui);ui.button('Next ›').props.onPress();ui.render();await settle(ui);
 assert.equal(new URL(f.requests.at(-1)).searchParams.get('page'),'3');ui.button('‹ Previous').props.onPress();ui.render();await settle(ui);assert.equal(new URL(f.requests.at(-1)).searchParams.get('page'),'1');ui.unmount();
});
