import {isCatalogueRevision,validCatalogueReceipt} from '../../src/lib/seller/catalogue-revision.js';
import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {normalizeCatalogueSave,canonicalCatalogueProduct} from '../../src/lib/seller/catalogue-contract.js';
import {isSellerUuid} from '../../src/lib/seller/validation.js';
import {requestSellerCatalogue} from '../../src/lib/seller/catalogue-client.js';
import {createConfirmedWrite} from './confirmed-write.js';
const blank=phase=>({phase,businesses:[],animals:[],categories:[],products:[]});
const list=(value,max)=>{if(!Array.isArray(value)||value.length>max)throw Error('Invalid catalogue');return value;};
const text=(value,max=160)=>{if(typeof value!=='string'||value.length>max)throw Error('Invalid catalogue');return value;};
const id=value=>{if(!isSellerUuid(value))throw Error('Invalid catalogue');return value;};
function project(data){
 const businesses=list(data.businesses,100).map(b=>({id:id(b.id),name:text(b.name)}));
 const animals=list(data.animals,200).map(a=>({id:id(a.id),label:text(a.label)}));
 const categories=list(data.categories,500).map(c=>({id:id(c.id),label:text(c.label),species:list(c.species,200).map(id)}));
 const products=list(data.products,100).map(p=>{
  if(!isCatalogueRevision(p.revision))throw Error('Invalid revision');
  if(typeof p.editable!=='boolean'||!Number.isFinite(Date.parse(p.updatedAt))||!businesses.some(b=>b.id===p.businessId))throw Error('Invalid catalogue');
  const fields={};for(const key of ['title','description','category_id','base_amount_minor'])fields[key]=text(p.fields?.[key],key==='description'?5000:160);
  for(const key of ['species_ids','variant_sku','variant_name','variant_value','variant_amount_minor'])fields[key]=list(p.fields?.[key],20).map(v=>text(v,160));
  if(['variant_name','variant_value','variant_amount_minor'].some(key=>fields[key].length!==fields.variant_sku.length))throw Error('Incomplete variant response');
  if(!Number.isInteger(p.imageCount)||p.imageCount<0||p.imageCount>5)throw Error('Invalid image count');
  return{id:id(p.id),businessId:id(p.businessId),status:text(p.status,40),updatedAt:p.updatedAt,revision:p.revision,editable:p.editable&&['draft','rejected'].includes(p.status),imageCount:p.imageCount,fields};
 });return{phase:'ready',businesses,animals,categories,products};
}
/** No token persistence; Test-origin only. Reads reverify identity; writes confirm
 * and reconcile complete validated product contents, never just a row count. */
export function createNativeSellerCatalogue({session,apiBaseUrl,testApiOrigin,render,renderAction,request=requestSellerCatalogue,timeoutMs=10000}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid timeout');
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);let view=blank('idle'),owner=session.snapshot()?.userId??null,epoch=0,disposed=false,pending=null,abort=null,expected=null,acknowledgedRevision=null,before=new Set();
 const emit=value=>{view=value;if(!disposed)render(value);};
 const clear=()=>{epoch++;abort?.abort();pending=null;emit(blank('signin'));};
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){const invalidate=owner!==null||next===null;owner=next;if(invalidate)clear();}});
 function load(){
  if(disposed)return Promise.resolve();if(pending)return pending;const generation=++epoch,controller=new AbortController();abort=controller;emit(blank('loading'));let timer;
  const current=()=>!disposed&&generation===epoch;
  const work=async()=>{const auth=await session.getSession();if(!current()||!owner||auth.userId!==owner)throw Error('Session changed');const data=await request({baseUrl,accessToken:auth.accessToken,signal:controller.signal});const latest=await session.getSession();if(!current()||latest.userId!==owner||auth.userId!==owner)throw Error('Session changed');return project(data);};
  pending=Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Read deadline')),timeoutMs);})]).then(data=>{if(current())emit(data);}).catch(error=>{if(current())emit(blank(error?.status===401?'signin':'error'));}).finally(()=>{clearTimeout(timer);controller.abort();if(current())pending=null;});return pending;
 }
 const actions=createConfirmedWrite({session,timeoutMs,render:renderAction,refresh:load,validate:input=>{
  if(view.phase!=='ready'||!view.businesses.some(b=>b.id===input.businessId))throw Error('Seller unavailable');
  const product=input.listingId?view.products.find(p=>p.id===input.listingId&&p.businessId===input.businessId):null;
  if(input.listingId&&(!product?.editable||product.revision!==input.expectedRevision))throw Error('Draft changed');
  if(input.action==='submit'){if(!product)throw Error('Draft required');normalizeCatalogueSave({businessId:input.businessId,listingId:product.id,fields:product.fields},view.categories);return{action:'submit',businessId:input.businessId,listingId:product.id,expectedRevision:product.revision};}
  if(input.action!=='save')throw Error('Unsupported action');
  const normalized=normalizeCatalogueSave(input,view.categories);if(normalized.product.speciesIds.some(id=>!view.animals.some(a=>a.id===id)))throw Error('Species unavailable');return JSON.parse(JSON.stringify(input));
 },send:async(command,accessToken,signal)=>{const result=await request({baseUrl,command,accessToken,signal});if(signal.aborted)return;if(!validCatalogueReceipt({apiVersion:2,...result},command.listingId,command.expectedRevision)||(!command.listingId&&before.has(result.listingId)))throw Error('Invalid acknowledgement');expected=result.listingId;acknowledgedRevision=result.revision;},matches:command=>{
  if(view.phase!=='ready')return false;
  const candidates=view.products.filter(p=>p.businessId===command.businessId&&(expected?p.id===expected:command.listingId?p.id===command.listingId:!before.has(p.id)));
  if(acknowledgedRevision&&candidates.some(p=>p.revision!==acknowledgedRevision))return false;
  if(command.action==='submit')return candidates.some(p=>p.status==='submitted');
  if(command.listingId&&candidates.some(p=>!validCatalogueReceipt({apiVersion:2,listingId:p.id,revision:p.revision},command.listingId,command.expectedRevision)))return false;
  const target=canonicalCatalogueProduct(command,view.categories);
  return candidates.length===1&&canonicalCatalogueProduct({businessId:command.businessId,listingId:candidates[0].id,fields:candidates[0].fields},view.categories)===target;
 }});
 return{load,prepare:input=>{if(['idle','invalid','success'].includes(actions.snapshot().phase)){expected=null;acknowledgedRevision=null;before=new Set(view.products.map(p=>p.id));}return actions.prepare(input);},confirm:actions.confirm,cancel:actions.cancel,reconcile:actions.reconcile,clear:()=>{actions.clear();clear();},dispose:()=>{disposed=true;actions.dispose();clear();unsubscribe();}};
}
