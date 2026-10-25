import type {AstroCookies} from 'astro';
import {createSupabaseServerClient} from '../supabase/server';
import {getSupabasePublicConfig} from '../supabase/config';
import type {ParsedCatalogParams} from './catalog-contract.js';
import type {CatalogApiResponse} from './catalog-client.js';
import type {FeaturedProduct} from './catalog-types.js';

type PageResult={state:'available'|'unconfigured'|'error';products:FeaturedProduct[];pagination?:CatalogApiResponse['pagination']};
export type PagePhoto=Omit<FeaturedProduct,'imageUrl'>&{imagePath:string|null};
type DatabasePage={products:PagePhoto[];pagination:CatalogApiResponse['pagination']};
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nullableString=(value:unknown)=>value===null||typeof value==='string';

/** Validate the RPC boundary before signing any paths or exposing a successful page. */
export function isDatabaseCataloguePage(value:unknown,filters:ParsedCatalogParams):value is DatabasePage{
 if(!object(value)||!Array.isArray(value.products)||!object(value.pagination))return false;
 const p=value.pagination;
 if(!Number.isSafeInteger(p.total)||Number(p.total)<0||p.pageSize!==filters.pageSize)return false;
 const count=Math.max(1,Math.ceil(Number(p.total)/filters.pageSize));
 const page=Math.min(filters.page,count);
 if(p.page!==page||p.pageCount!==count||p.hasPrevious!==(page>1)||p.hasNext!==(page<count)||p.truncated!==false)return false;
 if(value.products.length!==Math.min(filters.pageSize,Number(p.total)-(page-1)*filters.pageSize))return false;
 return isDatabaseCatalogueProducts(value.products,filters.pageSize);
}

export function isDatabaseCatalogueProducts(value:unknown,limit:number):value is PagePhoto[]{
 if(!Array.isArray(value)||value.length>limit)return false;
 const ids=new Set<string>();
 return value.every(item=>{
  if(!object(item)||!['id','slug','title','description','category','categorySlug','categoryId','sellerName','currencyCode'].every(key=>typeof item[key]==='string')
    ||!nullableString(item.imagePath)||!nullableString(item.imageAlt)||item.brand!==null
    ||!(item.priceMinor===null||(Number.isSafeInteger(item.priceMinor)&&Number(item.priceMinor)>0))
    ||typeof item.priceIsFrom!=='boolean'||!Array.isArray(item.species)||!item.species.every(slug=>typeof slug==='string')||ids.has(item.id as string))return false;
  ids.add(item.id as string);return true;
 });
}

/** One bounded read. Never retry a missing RPC with the old capped listing scan. */
export async function getPublicCataloguePage(request:Request,cookies:AstroCookies,filters:ParsedCatalogParams):Promise<PageResult>{
 const config=getSupabasePublicConfig();
 if(!config)return{state:'unconfigured',products:[]};
 try{
  const supabase=createSupabaseServerClient({request,cookies});
  const {data,error}=await supabase.rpc('read_public_catalogue_page',{
   p_query:filters.query??'',p_category_ids:filters.categoryIds??null,p_species_id:filters.animal?.id??null,
   p_min_minor:filters.minPrice??null,p_max_minor:filters.maxPrice??null,p_sort:filters.sort,
   p_page:filters.page,p_page_size:filters.pageSize,p_product:filters.productKey??null,
  });
  if(error||!isDatabaseCataloguePage(data,filters))return{state:'error',products:[]};
  const products=await signCatalogueProducts(supabase,data.products,config.listingImagesBucket);
  return{state:'available',products,pagination:data.pagination};
 }catch{return{state:'error',products:[]};}
}

export async function signCatalogueProducts(supabase:ReturnType<typeof createSupabaseServerClient>,rows:PagePhoto[],bucket:string|null):Promise<FeaturedProduct[]>{
 return Promise.all(rows.map(async (row):Promise<FeaturedProduct>=>{
   const {imagePath,...product}=row;
   let imageUrl:string|null=null;
   if(imagePath){
    // Signing remains caller/RLS-bound and limited to this page. A missing image
    // keeps the existing truthful placeholder instead of failing the product page.
    try{const signed=await supabase.storage.from(bucket||'listing-images').createSignedUrl(imagePath,3600);
     if(!signed.error)imageUrl=signed.data?.signedUrl??null;
    }catch{/* Existing product placeholder handles unavailable Storage. */}
   }
   return{id:product.id,slug:product.slug,title:product.title,description:product.description,
    category:product.category,categorySlug:product.categorySlug,categoryId:product.categoryId,
    species:product.species,brand:null,sellerName:product.sellerName,priceMinor:product.priceMinor,
    priceIsFrom:product.priceIsFrom,currencyCode:product.currencyCode,imageUrl,imageAlt:imageUrl?product.imageAlt:null};
  }));
}
