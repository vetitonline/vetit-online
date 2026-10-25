import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as contract from '../src/lib/marketplace/catalog-contract.js';
import * as client from '../src/lib/marketplace/catalog-client.js';
import * as navigation from '../src/lib/marketplace/category-navigation.js';
const taxonomy={state:'available',animals:[{id:'00000000-0000-4000-8000-000000000021',slug:'dogs',label:'Dogs'}],categories:[{id:'00000000-0000-4000-8000-000000000011',slug:'food',label:'Food',parentId:null,species:['00000000-0000-4000-8000-000000000021'],sortOrder:0}]};
const row=n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,slug:'synthetic-'+n,title:'Synthetic fixture '+n,description:'Offline fixture',category:'Food',categorySlug:'food',categoryId:taxonomy.categories[0].id,species:['dogs'],brand:null,sellerName:'Synthetic seller',priceMinor:100,priceIsFrom:false,currencyCode:'INR',imagePath:null,imageAlt:null});
const boundary=id=>({id,createdAt:'2026-10-10T10:00:00.123456Z'});
function compile(file,modules){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',code)(name=>{assert.ok(name in modules,name);return modules[name];},exports);return exports;}
function fixture({error=null,taxState='available',mutate=()=>{}}={}){
 const calls=[];const supabase={rpc:async(name,args)=>{
  calls.push({name,args});const size=args.p_page_size,position=args.p_boundary_id?Number(args.p_boundary_id.slice(-12)):null;
  const start=position===null?1:args.p_direction==='next'?position+1:Math.max(1,position-size);
  const products=Array.from({length:Math.min(size,Math.max(0,49-start))},(_,i)=>row(start+i));
  const data={products,window:{pageSize:size,hasPrevious:start>1,hasNext:start+products.length<49,first:products.length?boundary(products[0].id):null,last:products.length?boundary(products.at(-1).id):null}};
  mutate(data);return{data,error};},storage:{from:()=>{throw Error('Null photo paths should never be signed');}}};
 const modules={'../supabase/server':{createSupabaseServerClient:()=>supabase},'../supabase/config':{getSupabasePublicConfig:()=>({listingImagesBucket:'listing-images'})}};
 const page=compile('src/lib/marketplace/catalogue-page.ts',modules);
 const reader=compile('src/lib/marketplace/catalogue-window.ts',{...modules,'./featured-products':{getProductTaxonomy:async()=>({...taxonomy,state:taxState})},'./catalog-contract.js':contract,'./catalogue-page':page});
 const api=compile('src/pages/api/catalog/window.ts',{'../../../lib/marketplace/catalogue-window':reader});
 const fetchImpl=async url=>api.GET({request:new Request(new URL(url,'http://localhost')),cookies:{}});
 return{reader,calls,fetchImpl};
}
test('opaque cursors retain microseconds and reject changed scope, malformed encodings and invalid dates',async()=>{
 const {reader}=fixture();const filters=contract.parseCatalogParams(new URLSearchParams('animal=dogs&q=आखिरी&pageSize=2'),taxonomy);
 const scope=await reader.catalogueCursorScope(filters),point=boundary(row(2).id),token=reader.encodeCatalogueCursor(point,scope,'next');
 assert.equal(reader.decodeCatalogueCursor(token,scope).createdAt,point.createdAt);
 assert.equal(reader.decodeCatalogueCursor(token,'different'),null);assert.equal(reader.decodeCatalogueCursor(token+'=',scope),null);assert.equal(reader.decodeCatalogueCursor('x'.repeat(1025),scope),null);
 assert.equal(reader.isCatalogueBoundary({...point,createdAt:'2026-02-31T10:00:00.123456Z'}),false);
});
test('actual API v2/client use exact forward/backward boundaries without fake totals or page numbers',async()=>{
 const f=fixture();const first=await client.fetchCatalogWindow({animal:'dogs',pageSize:2},{fetchImpl:f.fetchImpl});
 assert.equal(first.apiVersion,2);assert.equal(first.window.hasPrevious,false);assert.ok(!('pagination' in first));
 const next=await client.fetchCatalogWindow({animal:'dogs',pageSize:2,cursor:first.window.nextCursor},{fetchImpl:f.fetchImpl});
 assert.equal(next.products[0].slug,'synthetic-3');assert.equal(f.calls[1].args.p_boundary_time,'2026-10-10T10:00:00.123456Z');
 const prev=await client.fetchCatalogWindow({animal:'dogs',pageSize:2,cursor:next.window.previousCursor},{fetchImpl:f.fetchImpl});
 assert.deepEqual(prev.products,first.products);assert.equal(f.calls[2].args.p_direction,'previous');
});
test('changed filters, numbered pages, other sorts and invalid cursors reject before RPC execution',async()=>{
 const f=fixture();const first=await client.fetchCatalogWindow({pageSize:2},{fetchImpl:f.fetchImpl});const n=f.calls.length;
 for(const query of ['cursor=','cursor=invalid','page=1','sort=name','product=some-product','min=20&max=10',`q=changed&cursor=${first.window.nextCursor}`]){
  const response=await f.fetchImpl('http://localhost/api/catalog/window?'+query);assert.equal(response.status,400);
 }
 assert.equal(f.calls.length,n);
});
test('window failures and malformed boundaries never leak provider details or return success',async()=>{
 for(const options of [{error:{code:'PGRST202',message:'private'}},{mutate:d=>d.window.first.id=row(99).id},{mutate:d=>d.products.push(d.products[0])}]){
  const f=fixture(options);const r=await f.fetchImpl('http://localhost/api/catalog/window');assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private'));
 }
 const f=fixture({taxState:'unconfigured'});assert.equal((await f.reader.readPublicCatalogueWindow(new Request('http://localhost?animal=dogs'),{})).body.state,'unconfigured');assert.equal(f.calls.length,0);
});
test('v1/v2 are explicit and incompatible replies fail; builder preserves filters without numbered-page state',async()=>{
 const href=client.buildCatalogueBrowseUrl({query:'आहार',animal:'dogs',category:'food',minPriceRupees:'1.25',cursor:'opaque'});
 const url=new URL(href,'http://localhost');assert.equal(url.pathname,'/browse');assert.equal(url.searchParams.get('cursor'),'opaque');assert.equal(url.searchParams.get('min'),'1.25');assert.equal(url.searchParams.has('page'),false);
 const f=fixture();await assert.rejects(client.fetchCatalog({},{fetchImpl:f.fetchImpl}),/version or format/);
});
test('actual cursor browse page uses shared taxonomy and clears the cursor when navigation changes scope',async()=>{
 const f=fixture();const source=fs.readFileSync('src/pages/browse.astro','utf8').split('---')[1];
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={'../lib/marketplace/catalogue-window':f.reader,'../lib/marketplace/catalog-client.js':client,'../lib/marketplace/category-navigation.js':navigation,'../lib/marketplace/catalog-contract.js':contract};
 const Astro={request:new Request('http://localhost/browse?animal=dogs&category=food&pageSize=2'),url:new URL('http://localhost/browse?animal=dogs&category=food&pageSize=2'),cookies:{},response:{status:200}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const page=await new AsyncFunction('require','exports','Astro',code+';return{result,href,tree};')(name=>name.endsWith('.astro')||name.endsWith('.css')?{}:modules[name],{},Astro);
 assert.equal(page.result.products.length,2);assert.equal(page.tree.roots[0].slug,'food');
 const reset=new URL(page.href(null,null),'http://localhost');assert.equal(reset.searchParams.has('category'),false);assert.equal(reset.searchParams.has('cursor'),false);assert.equal(reset.searchParams.get('animal'),'dogs');
});
