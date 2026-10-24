import type {AstroCookies} from 'astro';
import type {CatalogApiResponse} from './catalog-client.js';
import {CATALOG_API_VERSION,filterCatalogProducts,paginateCatalogItems,parseCatalogParams} from './catalog-contract.js';
import {getMarketplaceProducts,getProductTaxonomy} from './featured-products';

type ReadBody=Omit<CatalogApiResponse,'state'> & {state:CatalogApiResponse['state']|'error'|'invalid_request';message?:string};
/** One public read model for SSR listing/detail pages and the native HTTP API.
 * The existing data adapter remains responsible for publication/market/RLS rules.
 * No fixtures, service-role client, authentication shortcut or write path. */
export async function readPublicCatalog(request:Request,cookies:AstroCookies,searchParams=new URL(request.url).searchParams):Promise<{status:number;body:ReadBody}>{
 const taxonomy=await getProductTaxonomy(request,cookies);
 const params=parseCatalogParams(searchParams,taxonomy);
 const reply=(state:ReadBody['state'],status:number,products:CatalogApiResponse['products']=[],truncated=false,message?:string)=>{
  const page=paginateCatalogItems(products,params.page,params.pageSize);
  const body:ReadBody={apiVersion:CATALOG_API_VERSION,state,marketCode:'IN',products:page.items,pagination:{...page.pagination,truncated},filters:{query:params.query,animal:params.animal?.slug??null,category:params.category?.slug??null,product:params.productKey,minPriceMinor:params.minPrice,maxPriceMinor:params.maxPrice,sort:params.sort},taxonomy:{animals:taxonomy.animals,categories:taxonomy.categories},...(message?{message}:{})};
  return{status,body};
 };
 if(taxonomy.state==='error')return reply('error',503,[],false,'Catalogue is temporarily unavailable.');
 if(taxonomy.state==='unconfigured')return reply('unconfigured',200);
 if(params.invalid)return reply('invalid_request',400,[],false,'One or more catalogue filters are invalid.');
 const uuid=params.productKey!==null&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.productKey);
 const result=await getMarketplaceProducts(request,cookies,params.productKey?1:1000,{marketCode:'IN',taxonomy,...(params.productKey?uuid?{productId:params.productKey}:{productSlug:params.productKey}:{})});
 if(result.state==='error')return reply('error',503,[],false,'Catalogue is temporarily unavailable.');
 const products=result.state==='available'?filterCatalogProducts(result.products,params):[];
 return reply(result.state,200,products,result.products.length>=1000);
}
