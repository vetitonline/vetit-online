import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {parseCatalogParams} from '../src/lib/marketplace/catalog-contract.js';
const taxonomy={animals:[{id:'00000000-0000-4000-8000-000000000021',slug:'dogs',label:'Dogs'}],categories:[{id:'00000000-0000-4000-8000-000000000011',slug:'food',label:'Food',parentId:null,species:['00000000-0000-4000-8000-000000000021']}]};
const filters=search=>parseCatalogParams(new URLSearchParams(search),taxonomy);
const row=n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,slug:'synthetic-'+n,title:'Synthetic fixture',description:'Offline fixture only',category:'Food',categorySlug:'food',categoryId:taxonomy.categories[0].id,species:['dogs'],brand:null,sellerName:'Synthetic seller',priceMinor:100,priceIsFrom:false,currencyCode:'INR',imagePath:`fixtures/${n}.webp`,imageAlt:'Synthetic image'});
const page=(total=2505,requested=1,size=24)=>{const pageCount=Math.max(1,Math.ceil(total/size)),current=Math.min(pageCount,requested);return{products:Array.from({length:Math.min(size,total-(current-1)*size)},(_,i)=>row((current-1)*size+i+1)),pagination:{page:current,pageSize:size,total,pageCount,hasPrevious:current>1,hasNext:current<pageCount,truncated:false}};};
function fixture({data=page(),error=null,configured=true,throwRead=false,photoError=false}={}){
 const calls=[],signed=[];let clients=0;
 const client={rpc:async(name,args)=>{calls.push({name,args});if(throwRead)throw Error('sensitive provider details');return{data,error};},from:()=>{throw Error('Legacy scan must never run');},storage:{from:bucket=>({createSignedUrl:async(path,seconds)=>{signed.push({bucket,path,seconds});return photoError?{data:null,error:{message:'private'}}:{data:{signedUrl:'https://example.invalid/signed/'+path},error:null};}})}};
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/marketplace/catalogue-page.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={'../supabase/server':{createSupabaseServerClient:()=>{clients++;return client;}},'../supabase/config':{getSupabasePublicConfig:()=>configured?{listingImagesBucket:'listing-images'}:null}};
 const api={};new Function('require','exports',code)(name=>{assert.ok(name in modules,name);return modules[name];},api);
 return{...api,calls,signed,clients:()=>clients};
}
test('bounded adapter sends canonical filters to one RLS RPC and signs only the selected page',async()=>{
 const f=fixture();const p=filters('q=आखिरी%25_&category=food&animal=dogs&min=1.25&max=20&sort=price-desc');
 const result=await f.getPublicCataloguePage(new Request('http://localhost/products'),{},p);
 assert.equal(result.state,'available');assert.equal(result.pagination.total,2505);assert.equal(result.products.length,24);assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0],{name:'read_public_catalogue_page',args:{p_query:'आखिरी%_',p_category_ids:[taxonomy.categories[0].id],p_species_id:taxonomy.animals[0].id,p_min_minor:125,p_max_minor:2000,p_sort:'price-desc',p_page:1,p_page_size:24,p_product:null}});
 assert.equal(f.signed.length,24);assert.ok(f.signed.every(item=>item.seconds===3600&&item.bucket==='listing-images'));
 assert.equal(result.products[0].imageUrl,'https://example.invalid/signed/fixtures/1.webp');assert.ok(!('imagePath' in result.products[0]));
});
test('last page is not paginated twice; out-of-range requests use authoritative returned bounds',async()=>{
 const f=fixture({data:page(2505,10000,48)});const result=await f.getPublicCataloguePage(new Request('http://localhost'),{},filters('page=10000&pageSize=48'));
 assert.equal(result.pagination.page,53);assert.equal(result.products.length,9);assert.equal(f.signed.length,9);
});
test('empty catalogue keeps page 1 and exact zero count without Storage work',async()=>{
 const f=fixture({data:page(0,999)});const result=await f.getPublicCataloguePage(new Request('http://localhost'),{},filters('page=999'));
 assert.equal(result.state,'available');assert.equal(result.pagination.page,1);assert.equal(result.pagination.total,0);assert.deepEqual(result.products,[]);assert.equal(f.signed.length,0);
});
test('missing RPC, denied grants and thrown provider errors fail closed without legacy scan or signing',async()=>{
 for(const options of [{error:{code:'PGRST202',message:'not installed'}},{error:{code:'42501',message:'private permission details'}},{throwRead:true}]){
  const f=fixture(options),result=await f.getPublicCataloguePage(new Request('http://localhost'),{},filters(''));
  assert.deepEqual(result,{state:'error',products:[]});assert.equal(f.calls.length,1);assert.equal(f.signed.length,0);
 }
});
test('malformed counts, incomplete/duplicate rows and unsafe prices cannot become successful pages',async()=>{
 for(const mutate of [p=>p.pagination.total=-1,p=>p.pagination.pageCount=1,p=>p.pagination.truncated=true,p=>p.products.pop(),p=>p.products[1]=p.products[0],p=>p.products[0].priceMinor=Number.MAX_SAFE_INTEGER+1,p=>p.products[0].species=null]){
  const data=page();mutate(data);const f=fixture({data});assert.equal((await f.getPublicCataloguePage(new Request('http://localhost'),{},filters(''))).state,'error');assert.equal(f.signed.length,0);
 }
});
test('photo failure preserves valid products with existing fallback; extra database fields never escape',async()=>{
 const data=page(1);data.products[0].privateField='must not leave adapter';
 const f=fixture({data,photoError:true});const result=await f.getPublicCataloguePage(new Request('http://localhost'),{},filters(''));
 assert.equal(result.state,'available');assert.equal(result.products[0].imageUrl,null);assert.equal(result.products[0].imageAlt,null);assert.ok(!('privateField' in result.products[0]));
});
test('unconfigured connection does not instantiate a client or query anything',async()=>{
 const f=fixture({configured:false});assert.deepEqual(await f.getPublicCataloguePage(new Request('http://localhost'),{},filters('')),{state:'unconfigured',products:[]});assert.equal(f.clients(),0);assert.equal(f.calls.length,0);
});
