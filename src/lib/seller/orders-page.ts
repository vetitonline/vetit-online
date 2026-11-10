import { fulfilmentActions } from './orders.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
import {normalizeSellerOrders,groupSellerOrders} from './order-groups.js';
import type {SellerOrderSnapshot as Snapshot} from './order-groups.js';
const content=document.getElementById('seller-orders-content')!,status=document.getElementById('seller-orders-status')!;
const reload=document.getElementById('seller-orders-reload') as HTMLButtonElement;
const search=document.getElementById('seller-orders-search') as HTMLInputElement,filter=document.getElementById('seller-orders-filter') as HTMLSelectElement;
let dirty=false,lastQuery='',lastStatus='all';
let snapshot:Snapshot|undefined, revision=0,active:AbortController|undefined,disposed=false,busy=false;
const text=(parent:HTMLElement,value:string,tag='p')=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;};
function clear(){revision++;active?.abort();snapshot=undefined;content.replaceChildren();dirty=false;busy=false;reload.disabled=false;search.disabled=true;filter.disabled=true;}
async function read(signal:AbortSignal):Promise<Snapshot>{const r=await fetch('/api/seller/orders',{signal,redirect:'error',cache:'no-store'});if(!r.ok)throw Error(r.status===401?'Sign in to view seller orders.':'Seller orders are unavailable.');return normalizeSellerOrders(await r.json());}
function render(data:Snapshot){
  const groups=groupSellerOrders(data,{query:search.value,status:filter.value});
  snapshot=data;dirty=false;search.disabled=false;filter.disabled=false;content.replaceChildren();
  if(!groups.length)text(content,'No orders match your search and shipment status.');
  for(const group of groups){const container=text(content,'','section');container.className='seller-panel';text(container,`Order ${group.orderId}`,'h2');text(container,`Business ${group.businessId}`);
  text(container,group.subtotalMinor===null?'Item subtotal unavailable for this shipment.':`Items subtotal for this business: ${new Intl.NumberFormat('en-IN',{style:'currency',currency:group.currencyCode!}).format(group.subtotalMinor/100)}`);
  text(container,'This covers the visible item lines only; delivery, tax and customer-wide totals are excluded.');
  if(!data.items.length&&!data.fulfilments.length)text(content,'No seller order lines or shipments are currently visible to your active role.');
  for(const item of group.items){const row=text(container,'','article');row.className='seller-panel';text(row,item.title_snapshot,'h2');text(row,`Order ${item.orderId} · Quantity ${item.quantity} · ${new Intl.NumberFormat('en-IN',{style:'currency',currency:item.currency_code}).format(item.unit_price_minor/100)} per unit`);}
  for(const item of group.fulfilments){const row=text(container,'','article');row.className='seller-panel';text(row,`Shipment for order ${item.orderId}`,'h2');text(row,`Status: ${item.status}`);if(item.carrier)text(row,`Carrier: ${item.carrier}`);if(item.tracking_reference)text(row,`Tracking: ${item.tracking_reference}`);
    const actions=fulfilmentActions(item.status);if(!actions.length)continue;
    const form=document.createElement('form'),choice=document.createElement('select');choice.setAttribute('aria-label','Next shipment status');actions.forEach(action=>{const option=document.createElement('option');option.value=action;option.textContent=action;choice.append(option);});
    const carrier=document.createElement('input');carrier.placeholder='Carrier when shipping';carrier.setAttribute('aria-label','Carrier');carrier.maxLength=80;
    const tracking=document.createElement('input');tracking.placeholder='Tracking reference when shipping';tracking.setAttribute('aria-label','Tracking reference');tracking.maxLength=120;
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Confirm shipment update';submit.className='button button-secondary';form.append(choice,carrier,tracking,submit);row.append(form);
    form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});
    form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!snapshot)return;if(!window.confirm(`Change shipment to ${choice.value}?`))return;
      const owner=snapshot.profileId;busy=true;active?.abort();active=new AbortController();const version=++revision;reload.disabled=true;search.disabled=true;filter.disabled=true;content.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(el=>el.disabled=true);status.textContent='Updating shipment and checking its current status…';
      try{const r=await fetch('/api/seller/orders',{method:'POST',signal:active.signal,redirect:'error',cache:'no-store',headers:{'content-type':'application/json','x-vetit-profile-id':owner},body:JSON.stringify({fulfilmentId:item.id,nextStatus:choice.value,carrier:carrier.value,trackingReference:tracking.value})});if(!r.ok)throw Error('Shipment change could not be confirmed. Reload before trying again.');
        if(disposed||version!==revision)return;const updated=await read(active.signal);if(disposed||version!==revision)return;if(updated.profileId!==owner||updated.fulfilments.find(value=>value.id===item.id)?.status!==choice.value)throw Error('Shipment change needs reconciliation. Reload before trying again.');render(updated);status.textContent='Shipment status updated.';
      }catch(error){if(!disposed&&version===revision){snapshot=undefined;content.replaceChildren();status.textContent=error instanceof Error?error.message:'Reload to reconcile shipment status.';}}
      finally{if(!disposed&&version===revision){busy=false;reload.disabled=false;}}
    });
  }
  }
}
async function load(){if(busy||dirty&&!window.confirm('Reload and discard unsaved shipment details?'))return;clear();active=new AbortController();const version=revision;reload.disabled=true;status.textContent='Loading seller orders…';try{const data=await read(active.signal);if(!disposed&&version===revision){render(data);status.textContent='Seller order and shipment records loaded.';}}catch(error){if(!disposed&&version===revision)status.textContent=error instanceof Error?error.message:'Seller orders are unavailable.';}finally{if(!disposed&&version===revision)reload.disabled=false;}}
reload.addEventListener('click',()=>void load());
const applyFilters=()=>{if(!snapshot||busy)return;if(dirty&&!window.confirm('Change filters and discard unsaved shipment details?')){search.value=lastQuery;filter.value=lastStatus;return;}lastQuery=search.value;lastStatus=filter.value;render(snapshot);};
search.addEventListener('input',applyFilters);filter.addEventListener('change',applyFilters);
let unsubscribe=()=>{};try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){clear();search.value='';filter.value='all';lastQuery='';lastStatus='all';status.textContent='Your account changed. Reload seller orders.';}});unsubscribe=()=>subscription.unsubscribe();}catch{}
window.addEventListener('pagehide',()=>{disposed=true;clear();unsubscribe();},{once:true});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});void load();
