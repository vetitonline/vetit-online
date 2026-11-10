import { requestCheckoutReview } from './checkout-review-client.js';
import { requestSavedCart } from '../buyer/saved-cart-client.js';
import { normalizeQuoteLines } from './checkout-quote.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
import { createCheckoutAddressPicker } from './checkout-address-picker.js';
const form=document.getElementById('checkout-details') as HTMLFormElement;
const status=document.getElementById('checkout-details-status')!;
const summary=document.getElementById('checkout-details-summary')!;
const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
let revision=0, active:AbortController|undefined, disposed=false;
let addressOwner:string|undefined;
const addressLoad=document.getElementById('checkout-address-load') as HTMLButtonElement|null;
const addressChoice=document.getElementById('checkout-address-choice') as HTMLSelectElement|null;
const addressUse=document.getElementById('checkout-address-use') as HTMLButtonElement|null;
const addressStatus=document.getElementById('checkout-address-status');
const deliveryNames=['recipientName','phone','addressLine1','addressLine2','locality','city','stateRegion','postalCode'] as const;
const deliveryField=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
const accountChanged=(message:string)=>Object.assign(Error(message),{status:409});
const picker=createCheckoutAddressPicker({render:state=>{
  if(!addressLoad||!addressChoice||!addressUse||!addressStatus)return;
  addressLoad.disabled=state.phase==='loading';addressChoice.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='Choose an address';addressChoice.append(empty);
  for(const address of state.book?.addresses??[]){const option=document.createElement('option');option.value=address.id;option.textContent=`${address.label||address.recipientName} · ${address.city}${address.isDefault?' · Default':''}`;addressChoice.append(option);}
  addressChoice.disabled=state.phase!=='ready'||!state.book?.addresses.length;addressUse.disabled=addressChoice.disabled;
  addressStatus.textContent=state.message;
},apply:(address,profileId)=>{
  clear();addressOwner=profileId;for(const name of deliveryNames)deliveryField(name).value=address[name]??'';
  status.textContent='Saved delivery details copied. Review them and your contact email before continuing.';
}});
addressLoad?.addEventListener('click',()=>void picker.load());
addressUse?.addEventListener('click',()=>{try{picker.choose(addressChoice?.value??'');if(addressStatus)addressStatus.textContent='Saved address copied into the delivery form.';}catch(error){if(addressStatus)addressStatus.textContent=error instanceof Error?error.message:'Select a valid delivery address.';}});
document.getElementById('checkout-address-manual')?.addEventListener('click',()=>{clear();addressOwner=undefined;for(const name of deliveryNames)deliveryField(name).value='';status.textContent='Enter the delivery details you want to use.';});
if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('source')==='account')(form.elements.namedItem('source') as HTMLSelectElement).value='account';
const money=(amount:number|null)=>amount===null?'Not calculated':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(amount/100);
function clear(){revision++;active?.abort();summary.replaceChildren();button.disabled=false;}
form.addEventListener('input',()=>{clear();status.textContent='Details changed. Review checkout again.';});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;
  clear();const version=revision;active=new AbortController();button.disabled=true;
  status.textContent='Checking product prices and delivery prerequisites…';
  try{
    const data=new FormData(form),value=(name:string)=>String(data.get(name)??'');
    let lines,profileId;
    if(value('source')==='account'){
      const cart=await requestSavedCart({signal:active.signal});profileId=cart.profileId;
      lines=normalizeQuoteLines({lines:cart.items.map(item=>({listingId:item.listing_id,productVariantId:item.product_variant_id,quantity:item.quantity}))});
    }else{
      const cart=JSON.parse(localStorage.getItem('vetit-cart-v1')??'[]');
      if(!Array.isArray(cart))throw Error('The browser cart is invalid.');
      lines=normalizeQuoteLines({lines:cart.map(item=>({listingId:item.id,productVariantId:item.productVariantId,quantity:item.quantity}))});
    }
    if(disposed||version!==revision)return;
    if(profileId&&addressOwner&&profileId!==addressOwner)throw accountChanged('Your account changed. Reload your saved addresses and cart.');
    const result=await requestCheckoutReview({lines,customer:{email:value('email')},deliveryAddress:{recipientName:value('recipientName'),phone:value('phone'),addressLine1:value('addressLine1'),addressLine2:value('addressLine2'),locality:value('locality'),city:value('city'),stateRegion:value('stateRegion'),postalCode:value('postalCode'),countryCode:'IN'}},{signal:active.signal,profileId:addressOwner??profileId});
    if(disposed||version!==revision)return;
    if(profileId&&result.profileId!==profileId)throw accountChanged('Your account changed. Review the saved cart again.');
    if(addressOwner&&result.profileId!==addressOwner)throw accountChanged('Your account changed. Reload saved addresses and review the delivery details.');
    const paragraph=(text:string)=>{const row=document.createElement('p');row.textContent=text;summary.append(row);};
    result.summary.lines.forEach(item=>paragraph(`${item.title}${item.productVariantId?` · Option ${item.productVariantId}`:''} · ${item.quantity} × ${money(item.unitAmountMinor)} = ${money(item.lineAmountMinor)}`));
    paragraph(`Items: ${money(result.summary.subtotalMinor)}`);paragraph(`Shipping: ${money(result.shipping?.amountMinor??null)}`);paragraph(`Tax: ${money(result.taxMinor)}`);paragraph(`Order total: ${money(result.totalMinor)}`);
    result.blockers.forEach(paragraph);status.textContent='Review complete. Order placement and live payments remain unavailable.';
  }catch(error){if(!disposed&&version===revision){if([401,409].includes((error as {status?:number}).status??0)){clear();form.reset();addressOwner=undefined;picker.clear();}status.textContent=error instanceof Error?error.message:'Checkout could not be reviewed.';}}
  finally{if(!disposed&&version===revision)button.disabled=false;}
});
const changed=()=>{clear();status.textContent='The cart changed. Review checkout again.';};
window.addEventListener('storage',event=>{if(event.key===null||event.key==='vetit-cart-v1')changed();});
let unsubscribe=()=>{};
try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){clear();form.reset();addressOwner=undefined;picker.clear();status.textContent='Your account changed. Enter delivery details again.';}});unsubscribe=()=>subscription.unsubscribe();}catch{/* Unconfigured environments report unavailable from the API. */}
window.addEventListener('pagehide',()=>{disposed=true;clear();form.reset();addressOwner=undefined;picker.dispose();unsubscribe();},{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
