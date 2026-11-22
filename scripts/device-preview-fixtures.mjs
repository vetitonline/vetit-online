import {parseCatalogParams,filterCatalogProducts,paginateCatalogItems} from '../src/lib/marketplace/catalog-contract.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const taxonomy={animals:[{id:id(1),slug:'dogs',label:'Dogs'}],categories:[{id:id(2),slug:'accessories',label:'Accessories',parentId:null,species:[id(1)]}]};
const product={id:id(3),slug:'synthetic-device-harness',title:'Synthetic device-test harness',description:'LOCAL FIXTURE ONLY — not for sale.',category:'Accessories',categorySlug:'accessories',categoryId:id(2),sellerName:'Synthetic seller',species:['dogs'],priceMinor:12500,priceIsFrom:false,currencyCode:'INR',imageUrl:null,imageAlt:null};
const categories=[{slug:'veterinary',name:'Veterinary',parentSlug:null,requiresProfessionalVerification:true,requiresLegalReview:true},{slug:'grooming',name:'Grooming',parentSlug:null,requiresProfessionalVerification:false,requiresLegalReview:false},{slug:'daycare',name:'Daycare',parentSlug:null,requiresProfessionalVerification:false,requiresLegalReview:false}];
const services=categories.map((category,index)=>({id:id(10+index),businessId:id(20),title:`Synthetic ${category.name} appointment`,description:'LOCAL FIXTURE ONLY — no booking or payment.',categorySlug:category.slug,categoryName:category.name,mode:'appointment',city:'Mumbai',locality:'Synthetic locality',pricePaise:25000,currencyCode:'INR',durationMinutes:30,providerName:'Synthetic provider',providerSlug:'synthetic-provider',distanceKm:null}));
/** Intentionally no Supabase, upstream fetch, auth emulation or persistent writes. */
export function createDevicePreviewHandler({now=()=>Date.now()}={}){
 const json=(body,status=200)=>new Response(JSON.stringify({apiVersion:1,fixtureOnly:true,...body}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return request=>{
  const url=new URL(request.url);
  if(request.method!=='GET')return json({state:'fixture_mutation_disabled'},405);
  if(request.headers.has('authorization')||request.headers.has('cookie'))return json({state:'fixture_credentials_forbidden'},403);
  if(url.pathname==='/__device/health')return json({state:'available',databaseAccess:false,providerAccess:false,mutationsEnabled:false,nativeAuthentication:false});
  if(url.pathname==='/api/catalog'){
   const filters=parseCatalogParams(url.searchParams,taxonomy);if(filters.invalid)return json({state:'invalid_request'},400);
   const list=filters.productKey&&![product.id,product.slug].includes(filters.productKey)?[]:[product];const page=paginateCatalogItems(filterCatalogProducts(list,filters),filters.page,filters.pageSize);
   return json({state:'available',marketCode:'IN',products:page.items,taxonomy,pagination:{...page.pagination,truncated:false}});
  }
  if(url.pathname==='/api/services'){
   const category=url.searchParams.get('category'),city=url.searchParams.get('city');return json({state:'available',services:services.filter(service=>(!category||service.categorySlug===category)&&(!city||service.city.toLowerCase().includes(city.toLowerCase()))),categories,truncated:false});
  }
  if(url.pathname==='/api/services/slots'){
   const service=services.find(row=>row.id===url.searchParams.get('serviceListingId'));if(!service)return json({state:'invalid_request'},400);
   const starts_at=new Date(now()+3*86400000).toISOString(),ends_at=new Date(now()+3*86400000+1800000).toISOString();return json({state:'available',serviceListingId:service.id,slots:[{id:id(30),service_listing_id:service.id,starts_at,ends_at}],truncated:false});
  }
  if(url.pathname.startsWith('/api/'))return json({state:'fixture_private_api_disabled'},401);
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vetit local fixture</title><h1>Local device preview only</h1><p>No sign-in, appointment mutation, checkout or payment is available on this fixture server.</p><p>Return to the mobile app for public preview tests. Authenticated acceptance needs a separately approved Test build and backend.</p></html>',{headers:{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}});
 };
}
