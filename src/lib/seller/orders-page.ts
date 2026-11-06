import { fulfilmentActions } from './orders.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
import type { OrderFulfilment,OrderItem } from '../buyer/order-contract.js';
type Snapshot={apiVersion:1;state:'available';profileId:string;items:Array<OrderItem&{orderId:string}>;fulfilments:Array<OrderFulfilment&{orderId:string}>};
const content=document.getElementById('seller-orders-content')!,status=document.getElementById('seller-orders-status')!;
const reload=document.getElementById('seller-orders-reload') as HTMLButtonElement;
let snapshot:Snapshot|undefined, revision=0,active:AbortController|undefined,disposed=false,busy=false;
const text=(parent:HTMLElement,value:string,tag='p')=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;};
function clear(){revision++;active?.abort();snapshot=undefined;content.replaceChildren();busy=false;reload.disabled=false;}
async function read(signal:AbortSignal):Promise<Snapshot>{const r=await fetch('/api/seller/orders',{signal,redirect:'error',cache:'no-store'});if(!r.ok)throw Error(r.status===401?'Sign in to view seller orders.':'Seller orders are unavailable.');const body=await r.json();if(body.apiVersion!==1||body.state!=='available'||!Array.isArray(body.items)||!Array.isArray(body.fulfilments))throw Error('Seller response is invalid.');return body;}
function render(data:Snapshot){
  snapshot=data;content.replaceChildren();
  if(!data.items.length&&!data.fulfilments.length)text(content,'No seller order lines or shipments are currently visible to your active role.');
  for(const item of data.items){const row=text(content,'','article');row.className='seller-panel';text(row,item.title_snapshot,'h2');text(row,`Order ${item.orderId} · Quantity ${item.quantity} · ${new Intl.NumberFormat('en-IN',{style:'currency',currency:item.currency_code}).format(item.unit_price_minor/100)} per unit`);}
  for(const item of data.fulfilments){const row=text(content,'','article');row.className='seller-panel';text(row,`Shipment for order ${item.orderId}`,'h2');text(row,`Status: ${item.status}`);if(item.carrier)text(row,`Carrier: ${item.carrier}`);if(item.tracking_reference)text(row,`Tracking: ${item.tracking_reference}`);
    const actions=fulfilmentActions(item.status);if(!actions.length)continue;
    const form=document.createElement('form'),choice=document.createElement('select');choice.setAttribute('aria-label','Next shipment status');actions.forEach(action=>{const option=document.createElement('option');option.value=action;option.textContent=action;choice.append(option);});
    const carrier=document.createElement('input');carrier.placeholder='Carrier when shipping';carrier.setAttribute('aria-label','Carrier');carrier.maxLength=80;
    const tracking=document.createElement('input');tracking.placeholder='Tracking reference when shipping';tracking.setAttribute('aria-label','Tracking reference');tracking.maxLength=120;
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Confirm shipment update';submit.className='button button-secondary';form.append(choice,carrier,tracking,submit);row.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!snapshot)return;if(!window.confirm(`Change shipment to ${choice.value}?`))return;
      const owner=snapshot.profileId;busy=true;active?.abort();active=new AbortController();const version=++revision;reload.disabled=true;content.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(el=>el.disabled=true);status.textContent='Updating shipment and checking its current status…';
      try{const r=await fetch('/api/seller/orders',{method:'POST',signal:active.signal,redirect:'error',cache:'no-store',headers:{'content-type':'application/json','x-vetit-profile-id':owner},body:JSON.stringify({fulfilmentId:item.id,nextStatus:choice.value,carrier:carrier.value,trackingReference:tracking.value})});if(!r.ok)throw Error('Shipment change could not be confirmed. Reload before trying again.');
        if(disposed||version!==revision)return;const updated=await read(active.signal);if(disposed||version!==revision)return;if(updated.profileId!==owner||updated.fulfilments.find(value=>value.id===item.id)?.status!==choice.value)throw Error('Shipment change needs reconciliation. Reload before trying again.');render(updated);status.textContent='Shipment status updated.';
      }catch(error){if(!disposed&&version===revision){snapshot=undefined;content.replaceChildren();status.textContent=error instanceof Error?error.message:'Reload to reconcile shipment status.';}}
      finally{if(!disposed&&version===revision){busy=false;reload.disabled=false;}}
    });
  }
}
async function load(){if(busy)return;clear();active=new AbortController();const version=revision;reload.disabled=true;status.textContent='Loading seller orders…';try{const data=await read(active.signal);if(!disposed&&version===revision){render(data);status.textContent='Seller order and shipment records loaded.';}}catch(error){if(!disposed&&version===revision)status.textContent=error instanceof Error?error.message:'Seller orders are unavailable.';}finally{if(!disposed&&version===revision)reload.disabled=false;}}
reload.addEventListener('click',()=>void load());
let unsubscribe=()=>{};try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){clear();status.textContent='Your account changed. Reload seller orders.';}});unsubscribe=()=>subscription.unsubscribe();}catch{}
window.addEventListener('pagehide',()=>{disposed=true;clear();unsubscribe();},{once:true});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});void load();
