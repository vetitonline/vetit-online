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
import * as images from '../src/lib/marketplace/discovery-images.js';
import * as copy from '../src/lib/marketplace/workspace-copy.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const taxonomy={state:'available',animals:[{id:'dog',slug:'dogs',label:'Dogs'},{id:'cat',slug:'cats',label:'Cats'}],categories:[{id:'root',slug:'food',label:'Food',parentId:null,species:['dog','cat']},{id:'child',slug:'dog-food',label:'Dog Food',parentId:'root',species:['dog']},{id:'leaf',slug:'dry-food',label:'Dry Food',parentId:'child',species:['dog']}]};
const product=n=>({id:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,slug:`synthetic-feed-${n}`,title:`Synthetic fixture feed ${n}`,description:'Offline test fixture only',category:'Dry Food',categorySlug:'dry-food',categoryId:'leaf',species:['dogs'],brand:null,sellerName:'Synthetic seller',priceMinor:10000+n,priceIsFrom:false,currencyCode:'INR',imageUrl:null,imageAlt:null});
function compile(file,modules){const output=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.ok(!output.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error));const exports={};new Function('require','exports',output.outputText)(name=>{assert.ok(name in modules,`Unexpected module ${name}`);return modules[name];},exports);return exports;}
function fixture(){
 let available=Array.from({length:60},(_,i)=>product(i+1)),state='available',taxState='available';const reads=[];
 const adapters={getProductTaxonomy:async()=>({...taxonomy,state:taxState})};
 const pageAdapter={getPublicCataloguePage:async(_req,_cookies,filters)=>{reads.push({filters});
 const rows=state==='available'?contract.filterCatalogProducts(available.filter(p=>filters.productKey?p.slug===filters.productKey||p.id===filters.productKey:true),filters):[];
 const page=contract.paginateCatalogItems(rows,filters.page,filters.pageSize);return{state,products:page.items,pagination:{...page.pagination,truncated:false}};}};
 const reader=compile('src/lib/marketplace/catalog-reader.ts',{'./catalog-contract.js':contract,'./featured-products':adapters,'./catalogue-page':pageAdapter});
 const api=compile('src/pages/api/catalog/index.ts',{'../../../lib/marketplace/catalog-reader':reader});
 const requests=[];
 const fetchImpl=async url=>{const request=new Request(new URL(url,'http://localhost:4321'));requests.push(request.url);if(new URL(request.url).searchParams.get('page')==='3')available=available.slice(0,30);return api.GET({request,cookies:{}});};
 return{reader,api,reads,requests,fetchImpl,setProducts:p=>{available=p;},setState:s=>{state=s;},setTaxState:s=>{taxState=s;}};
}
test('shared SSR/API/native read contract navigates real taxonomy descendants with one paginated result',async()=>{
 const f=fixture(),url='http://localhost:4321/api/catalog?animal=dogs&category=food&page=999&pageSize=24';
 const ssr=await f.reader.readPublicCatalog(new Request(url),{}),native=await client.fetchCatalog({animal:'dogs',category:'food',page:999,pageSize:24},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});
 assert.deepEqual(ssr.body,native);assert.equal(native.products.length,12);assert.equal(native.pagination.page,3);assert.equal(native.pagination.total,60);assert.deepEqual(f.reads[0].filters.categoryIds,['root','child','leaf']);
 const href=client.buildProductsUrl({animal:'dogs',category:'dog-food',query:'fixture',pageSize:24});assert.equal(new URL(href,'http://localhost').pathname,'/products');
 assert.equal(contract.parseCatalogParams(new URL(href,'http://localhost').searchParams,taxonomy).category.id,'child');
 assert.deepEqual(navigation.categoryNavigation(taxonomy.categories,'dog','dry-food').breadcrumbs.map(c=>c.slug),['food','dog-food','dry-food']);
});
test('detail reads use exact slug or UUID, unavailable products stay empty, invalid requests skip data reads',async()=>{
 const f=fixture();for(const key of [product(1).id,product(1).slug]){const result=await client.fetchCatalog({product:key,pageSize:1},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.products[0].id,product(1).id);assert.equal(f.reads.at(-1).filters.pageSize,1);assert.equal(f.reads.at(-1).filters.productKey,key);}
 f.setProducts([]);const missing=await client.fetchCatalog({product:'not-published',pageSize:1},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.deepEqual(missing.products,[]);
 const before=f.reads.length;for(const search of ['animal=cats&category=dog-food','product=bad%20key','min=20&max=10']){const response=await f.api.GET({request:new Request('http://localhost:4321/api/catalog?'+search),cookies:{}});assert.equal(response.status,400);}assert.equal(f.reads.length,before);
});
test('unconfigured and error states remain explicit, with no synthetic/live fallback products',async()=>{
 const f=fixture();f.setState('unconfigured');const result=await client.fetchCatalog({},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.state,'unconfigured');assert.deepEqual(result.products,[]);
 f.setTaxState('error');const response=await f.api.GET({request:new Request('http://localhost:4321/api/catalog'),cookies:{}});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('shared response returns catalogues beyond the old scan limit with bounded pages',async()=>{
 const f=fixture();f.setProducts(Array.from({length:1001},(_,i)=>product(i+1)));const result=await client.fetchCatalog({},{baseUrl:'http://localhost:4321',fetchImpl:f.fetchImpl});assert.equal(result.pagination.truncated,false);assert.equal(result.pagination.total,1001);assert.equal(result.products.length,24);assert.equal(f.reads[0].filters.pageSize,24);
});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function ssrFrontmatter(file,f,url,params={}){
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').split('---')[1];const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const Astro={request:new Request(url),cookies:{},url:new URL(url),params,response:{status:200}};
 const modules={'../lib/marketplace/catalog-contract.js':contract,'../lib/marketplace/catalog-reader':f.reader,'../lib/marketplace/catalog-client.js':client,'../lib/marketplace/category-navigation.js':navigation,'../../lib/marketplace/catalog-reader':f.reader,'../../lib/marketplace/catalog-client.js':client,'../../lib/marketplace/featured-products':{formatProductPrice:()=>''}};
 const values=await new AsyncFunction('require','exports','Astro',output+`;return typeof pageProducts==='undefined'?{product,result}:{page,pageCount,pageProducts,tree,browseHref,priceIssue};`)(name=>{if(name.endsWith('.css')||name.endsWith('.astro'))return{};assert.ok(name in modules,name);return modules[name];},{},Astro);
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
function mobile(f,nativeOverrides={}){
 const components=Object.fromEntries(['ModerationWorkspace','NativeModeration','NativeBuyerOrders','NativeCheckoutReview','NativeAppointments','NativeSellerCatalogue','ProductPhoto','MarketplaceShortcuts','SpeciesDiscovery'].map(name=>['./src/'+name,{[name]:name}]));
 return mountNativeComponent('../App.tsx','default',{}, {...components,'../Vetit-online-transparent.png':'offline-logo','../src/lib/supabase/test-endpoints.js':{resolveMobileApiBase:()=> 'http://localhost:4321'},'../src/lib/marketplace/catalog-contract.js':contract,'../src/lib/marketplace/discovery-images.js':images,'../src/lib/marketplace/navigation.js':shortcuts,'../src/lib/marketplace/preview-cart.js':cart,'../src/lib/marketplace/workspace-copy.js':copy,'../src/lib/marketplace/category-navigation.js':navigation,'../src/lib/marketplace/catalog-client':{...client,fetchCatalogWindow:(filters,options)=>client.fetchCatalogWindow(filters,{...options,fetchImpl:f.windowFetch??f.fetchImpl}),fetchCatalog:(filters,options)=>client.fetchCatalog(filters,{...options,fetchImpl:f.fetchImpl})},'../src/lib/services/service-client':{},'../src/lib/services/appointment-client.js':{}},{ScrollView:'ScrollView',Image:'Image',StatusBar:'StatusBar',StyleSheet:{create:s=>s},...nativeOverrides});
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


test('native price drafts do not send partial requests; invalid ranges retain data and valid ranges apply once',async()=>{
 const f=fixture(),ui=mobile(f);await settle(ui);ui.button('Explore marketplace').props.onPress();ui.render();await settle(ui);
 const before=f.requests.length;
 ui.input('Minimum price in rupees','200');ui.input('Maximum price in rupees','100');await settle(ui);
 assert.equal(f.requests.length,before);ui.button('Apply price range').props.onPress();ui.render();await settle(ui);
 assert.equal(f.requests.length,before);assert.match(ui.text(),/Maximum price must be at least/);
 assert.equal(ui.nodes().find(n=>n.props?.accessibilityLabel==='Minimum price in rupees').props.value,'200');
 ui.input('Maximum price in rupees','300.50');ui.button('Apply price range').props.onPress();ui.render();await settle(ui);
 assert.equal(f.requests.length,before+1);const params=new URL(f.requests.at(-1)).searchParams;
 assert.equal(params.get('min'),'200');assert.equal(params.get('max'),'300.50');assert.equal(params.get('page'),'1');
 assert.ok(!ui.text().includes('Maximum price must be at least'));
 ui.button('Clear filters').props.onPress();ui.render();await settle(ui);
 assert.equal(new URL(f.requests.at(-1)).searchParams.has('min'),false);
 assert.equal(ui.nodes().find(n=>n.props?.accessibilityLabel==='Maximum price in rupees').props.value,'');ui.unmount();
});

test('native supports name sorting and real editorial category imagery without narrowing category species',async()=>{
 const f=fixture(),ui=mobile(f);await settle(ui);
 const photo=ui.nodes().find(n=>n.type==='ProductPhoto'&&n.props.label==='Food');assert.equal(photo.props.uri,'http://localhost:4321/images/discovery/essentials.webp');
 ui.button('Explore marketplace').props.onPress();ui.render();await settle(ui);chip(ui,'Name').props.onPress();ui.render();await settle(ui);
 assert.equal(new URL(f.requests.at(-1)).searchParams.get('sort'),'name');chip(ui,'Food').props.onPress();ui.render();await settle(ui);
 assert.equal(new URL(f.requests.at(-1)).searchParams.has('animal'),false);ui.unmount();
});

test('native buyer and account handoffs redact launch errors, coalesce taps and retry the exact route',async()=>{
 let fail=true,release;const urls=[];const f=fixture();
 const ui=mobile(f,{Linking:{openURL:async url=>{urls.push(url);await new Promise(resolve=>release=resolve);if(fail)throw Error('private-token');}}});await settle(ui);
 ui.button('Account').props.onPress();ui.render();ui.button('Continue to sign in online').props.onPress();ui.button('Continue to sign in online').props.onPress();ui.render();
 assert.equal(urls.length,1);assert.match(ui.text(),/Opening Vetit Online/);release();await drainNativeTasks();ui.render();
 assert.match(ui.text(),/Website could not be opened/);assert.ok(!ui.text().includes('private-token'));
 fail=false;ui.button('Retry opening website').props.onPress();ui.render();assert.equal(urls[1],urls[0]);assert.equal(urls[1],'http://localhost:4321/login');release();await drainNativeTasks();ui.render();
 assert.ok(!ui.text().includes('Website could not be opened'));ui.unmount();
});


test('website invalid price feedback retains bounds and agrees with the shared native rule',async()=>{
 const f=fixture(),result=await ssrFrontmatter('src/pages/products.astro',f,'http://localhost:4321/products?min=200&max=100');
 assert.equal(result.Astro.response.status,400);assert.equal(result.priceIssue.field,'max');assert.equal(result.priceIssue.message,contract.catalogPriceRange('200','100').issue.message);assert.equal(f.reads.length,0);
});

test('variable-price native product buttons open details without claiming variant checkout',async()=>{
 const f=fixture();f.setProducts([{...product(1),priceIsFrom:true}]);const ui=mobile(f);await settle(ui);
 const tile=ui.nodes().find(n=>typeof n.type==='function'&&n.type.name==='ProductTile');const tree=tile.type(tile.props);
 const controls=tree.children.filter(n=>n?.type==='Pressable');const action=controls[1];assert.equal(action.props.disabled,false);assert.equal(action.children[0].children[0],'View product details');
 action.props.onPress();ui.render();await settle(ui);const detail=ui.nodes().find(n=>typeof n.type==='function'&&n.type.name==='ProductDetail');assert.equal(detail.props.product.priceIsFrom,true);assert.equal(typeof detail.props.onOpenWeb,'function');ui.unmount();
});


test('native cursor browsing uses API v2 boundaries, resets changed filters and retains numbered sorts',async()=>{
 const f=fixture(),windows=[];
 f.windowFetch=async url=>{const params=new URL(url).searchParams;windows.push(params);const next=params.get('cursor')==='window-next';const start=next?25:1;const products=Array.from({length:next?6:24},(_,i)=>product(start+i));
 return Response.json({apiVersion:2,state:'available',marketCode:'IN',products,taxonomy,filters:{query:'',animal:null,category:null,product:null,minPriceMinor:null,maxPriceMinor:null,sort:'newest'},window:{pageSize:24,hasNext:!next,hasPrevious:next,nextCursor:next?null:'window-next',previousCursor:next?'window-back':null}});};
 const ui=mobile(f);await settle(ui);ui.button('Explore marketplace').props.onPress();ui.render();await settle(ui);
 ui.button('Browse newest with cursor navigation').props.onPress();ui.render();await settle(ui);
 assert.equal(windows.length,1);assert.equal(windows[0].has('page'),false);assert.ok(ui.text().includes('Use numbered pages'));
 ui.button('Next ›').props.onPress();ui.render();await settle(ui);assert.equal(windows.at(-1).get('cursor'),'window-next');
 ui.button('‹ Previous').props.onPress();ui.render();await settle(ui);assert.equal(windows.at(-1).get('cursor'),'window-back');
 ui.button('Next ›').props.onPress();ui.render();await settle(ui);
 ui.input('Minimum price in rupees','1');ui.button('Apply price range').props.onPress();ui.render();assert.equal(ui.button('‹ Previous').props.disabled,true);await settle(ui);
 assert.equal(windows.at(-1).has('cursor'),false);assert.equal(windows.at(-1).get('min'),'1');
 chip(ui,'Name').props.onPress();ui.render();await settle(ui);assert.equal(new URL(f.requests.at(-1)).searchParams.get('sort'),'name');assert.ok(ui.text().includes('Page '));ui.unmount();
});
