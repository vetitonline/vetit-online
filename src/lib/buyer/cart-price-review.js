import {normalizeSavedCart} from './saved-cart-contract.js';
import {requestSavedCart} from './saved-cart-client.js';
import {requestCheckoutQuote} from '../commerce/quote-client.js';
const fingerprint=cart=>JSON.stringify([cart.profileId,cart.cart?.id,cart.marketCode,cart.cart?.currency_code,cart.items.map(i=>[i.id,i.listing_id,i.product_variant_id,i.quantity]).sort((a,b)=>a[0].localeCompare(b[0]))]);
/** Read-only price/stock review. Never trusts stored prices or sends a cart mutation. */
export function createCartPriceReview({read=requestSavedCart,quote=requestCheckoutQuote,render}){
 let cart=null,key=null,epoch=0,active,disposed=false,busy=false;
 const publish=value=>{if(!disposed)render(value);};
 function setCart(input){
  if(disposed)return;
  let next=null;try{if(input){next=normalizeSavedCart(input);if(next.marketCode!=='IN'||next.cart&&next.cart.currency_code!=='INR')next=null;}}catch{}
  const nextKey=next?fingerprint(next):null;if(nextKey===key)return;
  epoch++;active?.abort();busy=false;cart=next;key=nextKey;
  const enabled=Boolean(cart?.items.length&&cart.items.length<=50);
  publish({phase:'idle',enabled,quote:null,message:cart?.items.length>50?'Price review supports up to 50 saved selections. Reduce this cart before reviewing.':'Review current prices and availability before checkout.'});
 }
 async function review(){
  if(disposed||busy||!cart?.items.length||cart.items.length>50)return;
  const original=key,owner=cart.profileId,version=++epoch;active?.abort();active=new AbortController();busy=true;
  const current=()=>!disposed&&version===epoch;
  publish({phase:'loading',enabled:false,quote:null,message:'Checking your saved cart, current prices and stock…'});
  try{
   const fresh=normalizeSavedCart(await read({signal:active.signal}));if(!current())return;
   if(fingerprint(fresh)!==original)throw Error('Your account or saved cart changed. Reload your cart before reviewing.');
   const lines=fresh.items.map(i=>({listingId:i.listing_id,...(i.product_variant_id?{productVariantId:i.product_variant_id}:{}),quantity:i.quantity}));
   const result=await quote(lines,{profileId:owner,signal:active.signal});if(!current())return;
   const latest=normalizeSavedCart(await read({signal:active.signal}));if(!current())return;
   if(fingerprint(latest)!==original)throw Error('Your account or saved cart changed. Reload your cart before reviewing.');
   publish({phase:'ready',enabled:true,quote:result,message:`Current item prices reviewed. ${result.stockState==='known'?'Available quantities checked.':'Stock is not fully confirmed.'} Delivery, tax and final total are calculated separately; no stock is reserved.`});
  }catch(error){if(current())publish({phase:'error',enabled:true,quote:null,message:error?.status===409||error?.status===422?'Some items need review. Check product options, quantities and availability, then review again.':error?.status===401?'Sign in and reload your saved cart.':error?.message?.startsWith('Your account or saved cart changed.')?error.message:'Price review is unavailable. Reload your cart and try again.'});}
  finally{if(current())busy=false;}
 }
 return{setCart,review,dispose(){disposed=true;epoch++;active?.abort();cart=null;key=null;}};
}
