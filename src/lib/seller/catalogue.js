import {isSellerUuid} from './validation.js';
import {normalizeCatalogueSave,SellerCatalogueError} from './catalogue-contract.js';
export {normalizeCatalogueSave,SellerCatalogueError} from './catalogue-contract.js';
import {canManageSellerBusiness,hasSellerCatalogRole,canEditSellerProduct} from './permissions.js';
import {executeModeration} from '../moderation/workflow.js';
const fail=status=>{throw new SellerCatalogueError(status);};
const id=value=>isSellerUuid(value)?value.toLowerCase():fail(400);
async function rows(query,max=100){const {data,error,count}=await query.limit(max+1);if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count!==data.length||count>max)fail(503);return data;}
export async function loadSellerCatalogue(client,userId){
 const memberships=await rows(client.from('business_memberships').select('profile_id,business_id,member_role,membership_status',{count:'exact'}).eq('profile_id',userId).eq('membership_status','active'));
 const ids=memberships.filter(m=>hasSellerCatalogRole(m.member_role)).map(m=>m.business_id);
 const businesses=ids.length?await rows(client.from('businesses').select('id,display_name',{count:'exact'}).in('id',ids).eq('is_active',true).is('archived_at',null)):[];
 const [animals,categories,links]=await Promise.all([
  rows(client.from('animal_species').select('id,display_name',{count:'exact'}).eq('is_active',true),200),
  rows(client.from('categories').select('id,name',{count:'exact'}).in('kind',['product','both']).eq('moderation_status','active'),500),
  rows(client.from('category_species').select('category_id,species_id',{count:'exact'}),4000),
 ]);
 const taxonomy=categories.map(c=>({id:c.id,label:c.name,species:links.filter(x=>x.category_id===c.id).map(x=>x.species_id)}));
 const listings=businesses.length?await rows(client.from('listings').select('id,business_id,title,description,category_id,moderation_status,updated_at',{count:'exact'}).in('business_id',businesses.map(b=>b.id)).eq('kind','product').is('archived_at',null).order('updated_at',{ascending:false})):[];
 const listingIds=listings.map(l=>l.id);
 const [species,variants,prices,images]=listingIds.length?await Promise.all([
  rows(client.from('listing_species').select('listing_id,species_id',{count:'exact'}).in('listing_id',listingIds),800),
  rows(client.from('product_variants').select('id,listing_id,seller_sku,option_attributes',{count:'exact'}).in('listing_id',listingIds).eq('active_status',true),2000),
  rows(client.from('listing_prices').select('listing_id,product_variant_id,amount_minor,currency_code,valid_from,valid_to',{count:'exact'}).in('listing_id',listingIds).eq('market_code','IN').eq('status','active').order('valid_from',{ascending:false}),4000),
  rows(client.from('listing_images').select('id,listing_id',{count:'exact'}).in('listing_id',listingIds),500),
 ]):[[],[],[],[]];
 const now=Date.now(),current=prices.filter(p=>Date.parse(p.valid_from)<=now&&(!p.valid_to||Date.parse(p.valid_to)>now));
 const products=listings.map(l=>{
  const vs=variants.filter(v=>v.listing_id===l.id),ps=current.filter(p=>p.listing_id===l.id);
  const price=variantId=>ps.find(p=>p.product_variant_id===variantId);
  const amount=p=>p&&p.currency_code==='INR'&&Number.isSafeInteger(p.amount_minor)&&p.amount_minor>0&&p.amount_minor%100===0?String(p.amount_minor/100):null;
  let supported=true;const mapped=vs.map(v=>{const entries=Object.entries(v.option_attributes??{}),rupees=amount(price(v.id));if(!v.option_attributes||typeof v.option_attributes!=='object'||Array.isArray(v.option_attributes)||entries.length!==1||typeof entries[0]?.[1]!=='string'||(price(v.id)&&rupees===null))supported=false;return{sku:v.seller_sku,name:entries[0]?.[0]??'',value:typeof entries[0]?.[1]==='string'?entries[0][1]:'',rupees:rupees??''};});
  const base=amount(price(null));if((!vs.length&&price(null)&&base===null)||(vs.length&&price(null)))supported=false;
  return{id:l.id,businessId:l.business_id,status:l.moderation_status,updatedAt:l.updated_at,editable:supported&&canEditSellerProduct(l.moderation_status),imageCount:images.filter(i=>i.listing_id===l.id).length,fields:{title:l.title,description:l.description??'',category_id:l.category_id,base_amount_minor:vs.length?'':base??'',species_ids:species.filter(x=>x.listing_id===l.id).map(x=>x.species_id),variant_sku:mapped.map(v=>v.sku),variant_name:mapped.map(v=>v.name),variant_value:mapped.map(v=>v.value),variant_amount_minor:mapped.map(v=>v.rupees)}};
 });
 return{businesses:businesses.map(b=>({id:b.id,name:b.display_name})),animals:animals.map(a=>({id:a.id,label:a.display_name})),categories:taxonomy,products};
}
export async function writeSellerCatalogue(client,userId,input){
 if(!input||!['save','submit'].includes(input.action))fail(400);
 const businessId=id(input.businessId),listingId=input.listingId==null?null:id(input.listingId);
 const {data:membership,error:me}=await client.from('business_memberships').select('profile_id,business_id,member_role,membership_status',{count:'exact'}).eq('business_id',businessId).eq('profile_id',userId).eq('membership_status','active').maybeSingle();
 if(me||!canManageSellerBusiness(membership,userId,businessId))fail(403);
 const {data:business,error:be}=await client.from('businesses').select('id,is_active,archived_at',{count:'exact'}).eq('id',businessId).maybeSingle();if(be||!business?.is_active||business.archived_at)fail(403);
 if(listingId){const {data:l,error}=await client.from('listings').select('business_id,kind,moderation_status,archived_at,updated_at',{count:'exact'}).eq('id',listingId).maybeSingle();if(error||!l||l.business_id!==businessId||l.kind!=='product'||l.archived_at||!canEditSellerProduct(l.moderation_status))fail(403);if(typeof input.expectedUpdatedAt!=='string'||l.updated_at!==input.expectedUpdatedAt)fail(409);}
 if(input.action==='submit'){if(!listingId)fail(400);await executeModeration(client,{action:'open',kind:'product',subject:listingId});return{listingId};}
 // Load via the same authenticated client; no cookie-only taxonomy client in native requests.
 const categories=await rows(client.from('categories').select('id',{count:'exact'}).in('kind',['product','both']).eq('moderation_status','active'),500);
 const links=await rows(client.from('category_species').select('category_id,species_id',{count:'exact'}),4000);
 const {product}=normalizeCatalogueSave(input,categories.map(c=>({...c,species:links.filter(l=>l.category_id===c.id).map(l=>l.species_id)})));
 const activeSpecies=await rows(client.from('animal_species').select('id',{count:'exact'}).in('id',product.speciesIds).eq('is_active',true),8);if(activeSpecies.length!==product.speciesIds.length)fail(422);
 const {data,error}=await client.rpc('save_seller_product',{p_listing_id:listingId,p_business_id:businessId,p_title:product.title,p_slug:product.slug,p_description:product.description,p_category_id:product.categoryId,p_species_ids:product.speciesIds,p_base_amount_minor:product.baseAmountMinor,p_variants:product.variants});
 if(error)fail(error.code==='23505'?409:error.code==='42501'?403:['22023','23514'].includes(error.code)?422:503);
 if(!isSellerUuid(data))fail(503);return{listingId:data};
}
