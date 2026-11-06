import { requestCheckoutReview } from './checkout-review-client.js';
import { requestSavedCart } from '../buyer/saved-cart-client.js';
import { normalizeQuoteLines } from './checkout-quote.js';
import { createSupabaseBrowserClient } from '../supabase/browser';
const form=document.getElementById('checkout-details') as HTMLFormElement;
const status=document.getElementById('checkout-details-status')!;
const summary=document.getElementById('checkout-details-summary')!;
const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
let revision=0, active:AbortController|undefined, disposed=false;
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
    const result=await requestCheckoutReview({lines,customer:{email:value('email')},deliveryAddress:{recipientName:value('recipientName'),phone:value('phone'),addressLine1:value('addressLine1'),addressLine2:value('addressLine2'),city:value('city'),stateRegion:value('stateRegion'),postalCode:value('postalCode'),countryCode:'IN'}},{signal:active.signal});
    if(disposed||version!==revision)return;
    if(profileId&&result.profileId!==profileId)throw Error('Your account changed. Review the saved cart again.');
    const paragraph=(text:string)=>{const row=document.createElement('p');row.textContent=text;summary.append(row);};
    result.summary.lines.forEach(item=>paragraph(`${item.title}${item.productVariantId?` · Option ${item.productVariantId}`:''} · ${item.quantity} × ${money(item.unitAmountMinor)} = ${money(item.lineAmountMinor)}`));
    paragraph(`Items: ${money(result.summary.subtotalMinor)}`);paragraph(`Shipping: ${money(result.shipping?.amountMinor??null)}`);paragraph(`Tax: ${money(result.taxMinor)}`);paragraph(`Order total: ${money(result.totalMinor)}`);
    result.blockers.forEach(paragraph);status.textContent='Review complete. Order placement and live payments remain unavailable.';
  }catch(error){if(!disposed&&version===revision)status.textContent=error instanceof Error?error.message:'Checkout could not be reviewed.';}
  finally{if(!disposed&&version===revision)button.disabled=false;}
});
const changed=()=>{clear();status.textContent='The cart changed. Review checkout again.';};
window.addEventListener('storage',event=>{if(event.key===null||event.key==='vetit-cart-v1')changed();});
let unsubscribe=()=>{};
try{const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){clear();form.reset();status.textContent='Your account changed. Enter delivery details again.';}});unsubscribe=()=>subscription.unsubscribe();}catch{/* Unconfigured environments report unavailable from the API. */}
window.addEventListener('pagehide',()=>{disposed=true;clear();form.reset();unsubscribe();},{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
