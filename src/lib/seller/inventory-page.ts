import { createInventoryWorkspace } from './inventory-workspace.js';
import type { InventoryState } from './inventory-workspace.js';
import { inventoryCopy } from './inventory-copy.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
const get=<T extends HTMLElement=HTMLElement>(name:string)=>document.getElementById(`inventory-${name}`) as T;
const content=get('content'),status=get('status'),reload=get<HTMLButtonElement>('reload'),business=get<HTMLSelectElement>('business'),search=get<HTMLInputElement>('search');
const copy=inventoryCopy(new URLSearchParams(location.search).get('lang')??'en');document.documentElement.lang=copy.language;get('title').textContent=copy.title;search.placeholder=copy.filter;
let state:InventoryState,dirty=false;
let previousBusiness='',previousSearch='';
const text=(parent:HTMLElement,value:string,tag='p')=>{const element=document.createElement(tag);element.textContent=value;parent.append(element);return element;};
function render(next:InventoryState){
  state=next;const ready=state.phase==='ready',busy=state.phase==='loading'||state.phase==='saving';
  reload.disabled=busy;business.disabled=!ready;search.disabled=!ready;get('signin').hidden=state.phase!=='signin';
  status.textContent=state.message||(state.phase==='loading'?copy.loading:state.phase==='saving'?copy.saving:ready?copy.ready:'Inventory unavailable. Reload to try again.');
  const selected=business.value;business.replaceChildren();const all=document.createElement('option');all.value='';all.textContent=copy.all;business.append(all);
  for(const b of state.inventory?.businesses??[]){const option=document.createElement('option');option.value=b.id;option.textContent=b.name;business.append(option);}business.value=selected;
  content.replaceChildren();content.setAttribute('aria-busy',String(busy));
  if(!state.inventory){dirty=false;return;}
  const query=search.value.trim().toLocaleLowerCase('en');const rows=state.inventory.variants.filter(row=>(!business.value||row.businessId===business.value)&&(!query||`${row.title} ${row.sku}`.toLocaleLowerCase('en').includes(query)));
  if(!rows.length)text(content,copy.empty);
  for(const row of rows){
    const card=document.createElement('article');card.className='seller-panel';text(card,row.title,'h2');text(card,`SKU: ${row.sku}`);
    text(card,Object.entries(row.attributes).map(([key,value])=>`${key}: ${typeof value==='string'||typeof value==='number'?value:JSON.stringify(value)}`).join(' · '));
    const catalogue=document.createElement('a');catalogue.href=`/products/${row.listingId}`;catalogue.textContent='View customer product page';card.append(catalogue);
    const counts=document.createElement('dl');for(const [label,value] of [[copy.onHand,row.quantityOnHand],[copy.reserved,row.quantityReserved],[copy.available,row.quantityOnHand===null?null:row.quantityOnHand-row.quantityReserved!]] as const){text(counts,label,'dt');text(counts,value===null?copy.unknown:String(value),'dd');}card.append(counts);
    if(row.inventoryId===null)text(card,copy.stockUnknown);
    const form=document.createElement('form'),label=document.createElement('label');label.textContent=copy.onHand;const input=document.createElement('input');input.type='number';input.min=String(row.quantityReserved??0);input.max='10000000';input.step='1';input.required=true;input.value=String(row.quantityOnHand??0);input.disabled=!ready;label.append(input);
    const save=document.createElement('button');save.type='submit';save.className='button button-primary';save.textContent=copy.save;save.disabled=!ready;form.append(label,save);card.append(form);content.append(card);
    input.addEventListener('input',()=>{dirty=true;});
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;if(!window.confirm(`Set ${row.sku} on-hand stock to ${input.value}? This reloads inventory and discards any other unsaved stock edits.`))return;try{await controller.save(row.variantId,Number(input.value));dirty=false;}catch(error){status.textContent=error instanceof Error?error.message:'Review stock quantity.';}});
  }
}
const controller=createInventoryWorkspace({render});
const discard=()=>!dirty||window.confirm('Discard unsaved stock edits?');
reload.addEventListener('click',()=>{if(discard()){dirty=false;void controller.load();}});
business.addEventListener('change',()=>{if(discard()){dirty=false;previousBusiness=business.value;render(state);}else business.value=previousBusiness;});search.addEventListener('input',()=>{if(discard()){dirty=false;previousSearch=search.value;render(state);}else search.value=previousSearch;});
let unsubscribe=()=>{};try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'){search.value='';business.value='';previousBusiness='';previousSearch='';controller.clear();}});unsubscribe=()=>subscription.unsubscribe();}catch{}
void controller.load();window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>{dirty=false;content.replaceChildren();controller.dispose();unsubscribe();},{once:true});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
