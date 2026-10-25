import type {AstroCookies} from 'astro';
import {createSupabaseServerClient} from '../supabase/server';
import {getSupabasePublicConfig} from '../supabase/config';
import {getProductTaxonomy} from './featured-products';
import {parseCatalogParams,type ParsedCatalogParams} from './catalog-contract.js';
import type {CatalogWindowResponse} from './catalog-client.js';
import {isDatabaseCatalogueProducts,signCatalogueProducts} from './catalogue-page';

type Boundary={id:string;createdAt:string};
type Cursor=Boundary&{v:1;scope:string;direction:'next'|'previous'};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function isCatalogueBoundary(v:unknown):v is Boundary{
 if(!object(v)||typeof v.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)
  ||typeof v.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v.createdAt))return false;
 const date=new Date(v.createdAt);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,23)===v.createdAt.slice(0,23);
}
export async function catalogueCursorScope(params:ParsedCatalogParams):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify([params.query,params.animal?.id??null,params.categoryIds?[...params.categoryIds].sort():null,params.minPrice,params.maxPrice,params.pageSize,'newest']));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
const base64url=(text:string)=>btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function encodeCatalogueCursor(boundary:Boundary,scope:string,direction:Cursor['direction']):string{
 return base64url(JSON.stringify({v:1,scope,direction,...boundary}));
}
/** Tokens bind navigation to filters, not authorization; caller RLS always applies.
 * No secret/signing key is introduced and microseconds are never rounded through JS Date. */
export function decodeCatalogueCursor(token:string,scope:string):Cursor|null{
 if(token.length>1024||!token||!/^[A-Za-z0-9_-]+$/.test(token))return null;
 try{const text=atob(token.replaceAll('-','+').replaceAll('_','/'));if(base64url(text)!==token)return null;
  const v:unknown=JSON.parse(text);
  return object(v)&&v.v===1&&v.scope===scope&&(v.direction==='next'||v.direction==='previous')&&isCatalogueBoundary(v)?v as Cursor:null;
 }catch{return null;}
}
type WindowBody=Omit<CatalogWindowResponse,'state'>&{state:CatalogWindowResponse['state']|'error'|'invalid_request';message?:string};
export async function readPublicCatalogueWindow(request:Request,cookies:AstroCookies,search=new URL(request.url).searchParams):Promise<{status:number;body:WindowBody}>{
 const taxonomy=await getProductTaxonomy(request,cookies),params=parseCatalogParams(search,taxonomy);
 const scope=await catalogueCursorScope(params),token=search.get('cursor');
 const cursor=token?decodeCatalogueCursor(token,scope):null;
 const body:WindowBody={apiVersion:2,state:'available',marketCode:'IN',products:[],
  window:{pageSize:params.pageSize,hasNext:false,hasPrevious:false,nextCursor:null,previousCursor:null},
  filters:{query:params.query,animal:params.animal?.slug??null,category:params.category?.slug??null,product:null,minPriceMinor:params.minPrice,maxPriceMinor:params.maxPrice,sort:'newest'},
  taxonomy:{animals:taxonomy.animals,categories:taxonomy.categories}};
 const fail=(state:WindowBody['state'],status:number,message?:string)=>({status,body:{...body,state,...(message?{message}:{})}});
 if(taxonomy.state==='error')return fail('error',503,'Catalogue is temporarily unavailable.');
 if(taxonomy.state==='unconfigured')return fail('unconfigured',200);
 if(params.invalid||params.productKey||params.sort!=='newest'||search.has('page')||(search.has('cursor')&&!cursor))return fail('invalid_request',400,'Choose newest browsing and restart after changing filters.');
 const config=getSupabasePublicConfig();if(!config)return fail('unconfigured',200);
 try{
  const supabase=createSupabaseServerClient({request,cookies});
  const {data,error}=await supabase.rpc('read_public_catalogue_window',{
   p_query:params.query,p_category_ids:params.categoryIds??null,p_species_id:params.animal?.id??null,
   p_min_minor:params.minPrice,p_max_minor:params.maxPrice,p_page_size:params.pageSize,
   p_boundary_time:cursor?.createdAt??null,p_boundary_id:cursor?.id??null,p_direction:cursor?.direction??'next',
  });
  if(error||!object(data)||!isDatabaseCatalogueProducts(data.products,params.pageSize)||!object(data.window))return fail('error',503,'Catalogue is temporarily unavailable.');
  const w=data.window,rows=data.products;
  if(w.pageSize!==params.pageSize||typeof w.hasNext!=='boolean'||typeof w.hasPrevious!=='boolean'
   ||(rows.length===0?(w.first!==null||w.last!==null||w.hasNext||w.hasPrevious):
     (!isCatalogueBoundary(w.first)||!isCatalogueBoundary(w.last)||w.first.id!==rows[0].id||w.last.id!==rows.at(-1)?.id)))return fail('error',503,'Catalogue is temporarily unavailable.');
  body.products=await signCatalogueProducts(supabase,rows,config.listingImagesBucket);
  body.window={pageSize:params.pageSize,hasNext:w.hasNext,hasPrevious:w.hasPrevious,
   nextCursor:w.hasNext&&isCatalogueBoundary(w.last)?encodeCatalogueCursor(w.last,scope,'next'):null,
   previousCursor:w.hasPrevious&&isCatalogueBoundary(w.first)?encodeCatalogueCursor(w.first,scope,'previous'):null};
  return{status:200,body};
 }catch{return fail('error',503,'Catalogue is temporarily unavailable.');}
}
