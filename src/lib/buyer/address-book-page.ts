import { createAddressBookWorkspace } from './address-book-workspace.js';
import { normalizeAddressInput } from './address-book-contract.js';
import type { SavedAddress } from './address-book-contract.js';
import type { AddressBookState } from './address-book-workspace.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
const get=<T extends HTMLElement=HTMLElement>(name:string)=>document.getElementById(`addresses-${name}`) as T;
const form=get<HTMLFormElement>('form'),fields=get<HTMLFieldSetElement>('fields'),status=get('status'),list=get('list'),reload=get<HTMLButtonElement>('reload');
const heading=document.getElementById('address-editor-heading')!;
const names=['label','recipientName','phone','addressLine1','addressLine2','locality','city','stateRegion','postalCode','countryCode'] as const;
const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
let selected:SavedAddress|undefined,dirty=false,snapshot:AddressBookState;
function reset(){selected=undefined;dirty=false;form.reset();field('countryCode').value='IN';heading.textContent='Add a delivery address';}
function mayDiscard(){return !dirty||window.confirm('Discard your unsaved address changes?');}
function edit(address:SavedAddress){
  if(!mayDiscard())return;selected=address;dirty=false;
  for(const name of names)field(name).value=address[name]??'';
  field('isDefault').checked=address.isDefault;heading.textContent='Edit delivery address';field('recipientName').focus();
}
function render(state:AddressBookState){
  const saved=state.phase==='ready'&&snapshot?.phase==='saving';snapshot=state;
  fields.disabled=state.phase!=='ready';reload.disabled=state.phase==='saving'||state.phase==='loading';
  get('signin').hidden=state.phase!=='signin';status.textContent=state.message||(state.phase==='ready'?'Your delivery addresses are ready.':'Saved addresses are unavailable.');
  list.replaceChildren();list.setAttribute('aria-busy',String(reload.disabled));
  if(saved||state.phase==='signin')reset();
  if(!state.book)return;
  if(!state.book.addresses.length){const p=document.createElement('p');p.textContent='No saved addresses yet. Add your first delivery address.';list.append(p);}
  for(const address of state.book.addresses){
    const row=document.createElement('article');row.className='seller-panel';
    const title=document.createElement('h3');title.textContent=(address.label||address.recipientName)+(address.isDefault?' · Default':'');row.append(title);
    const detail=document.createElement('p');detail.textContent=[address.recipientName,address.phone,address.addressLine1,address.addressLine2,address.locality,address.city,address.stateRegion,address.postalCode,address.countryCode].filter(Boolean).join(', ');row.append(detail);
    const button=(label:string,action:()=>void)=>{const node=document.createElement('button');node.type='button';node.className='button button-secondary small-button';node.textContent=label;node.disabled=state.phase!=='ready';node.addEventListener('click',action);row.append(node);};
    button('Edit',()=>edit(address));
    if(!address.isDefault)button('Make default',()=>{if(mayDiscard())void controller.mutate({action:'save',address:{...address,isDefault:true}});});
    button('Remove',()=>{if(mayDiscard()&&window.confirm(`Remove ${address.label||address.recipientName} from your saved addresses?`))void controller.mutate({action:'remove',id:address.id});});
    list.append(row);
  }
}
const controller=createAddressBookWorkspace({render});
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('submit',event=>{
  event.preventDefault();if(snapshot?.phase!=='ready')return;
  try{const address=normalizeAddressInput({...selected,id:selected?.id??null,...Object.fromEntries(names.map(name=>[name,field(name).value])),isDefault:field('isDefault').checked});void controller.mutate({action:'save',address});}
  catch(error){status.textContent=error instanceof Error?error.message:'Review your delivery details.';}
});
get('new').addEventListener('click',()=>{if(mayDiscard())reset();});
reload.addEventListener('click',()=>{if(mayDiscard()){reset();void controller.load();}});
let unsubscribe=()=>{};
try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'){reset();controller.clear();}});unsubscribe=()=>subscription.unsubscribe();}catch{/* API readiness is reported without inventing a signed-in account. */}
void controller.load();
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{reset();list.replaceChildren();controller.dispose();unsubscribe();},{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
