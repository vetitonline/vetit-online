import {normalizeQuoteLines,MAX_LINE_QUANTITY,MAX_QUOTE_LINES} from './checkout-quote.js';
import {normalizeSavedCart} from '../buyer/saved-cart-contract.js';
import {requestSavedCart} from '../buyer/saved-cart-client.js';
export class CheckoutCartError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fingerprint=snapshot=>JSON.stringify([snapshot.source,snapshot.profileId??null,snapshot.cartId??null,[...snapshot.lines].sort((a,b)=>(a.listingId+':'+(a.productVariantId??'')).localeCompare(b.listingId+':'+(b.productVariantId??'')))]);
/** Read selections only. Stored prices, seller claims and payment fields are never
 * authority; existing server review still validates current prices and stock. */
export function createCheckoutCartReader({readBrowser=()=>globalThis.localStorage.getItem('vetit-cart-v1'),readAccount=requestSavedCart}={}){
 async function capture(source,{signal,expectedProfileId}={}){
  if(!['browser','account'].includes(source))throw new CheckoutCartError('invalid_source','Choose a supported cart source.');
  let selections,profileId,cartId;
  if(source==='account'){
   const cart=normalizeSavedCart(await readAccount({signal}));
   if(expectedProfileId&&cart.profileId.toLowerCase()!==expectedProfileId.toLowerCase())throw new CheckoutCartError('account_changed','Your account changed. Reload saved addresses and cart before reviewing.',409);
   if(cart.marketCode!=='IN'||cart.cart&&cart.cart.currency_code!=='INR')throw new CheckoutCartError('invalid_market','Only the India account cart can be reviewed here.');
   profileId=cart.profileId.toLowerCase();cartId=cart.cart?.id.toLowerCase()??null;
   selections=cart.items.map(item=>({listingId:item.listing_id,productVariantId:item.product_variant_id,quantity:item.quantity}));
  }else{
   let raw;try{raw=readBrowser();}catch{throw new CheckoutCartError('storage_unavailable','Browser storage is unavailable. Restore access to this browser’s cart or choose your saved account cart.');}
   let saved;try{saved=JSON.parse(raw??'[]');}catch{throw new CheckoutCartError('invalid_cart','The browser cart is invalid. Return to the cart and check its items.');}
   if(!Array.isArray(saved))throw new CheckoutCartError('invalid_cart','The browser cart is invalid. Return to the cart and check its items.');
   selections=saved.map(item=>({listingId:item?.id,productVariantId:item?.productVariantId,quantity:item?.quantity}));
  }
  if(!selections.length)throw new CheckoutCartError('empty_cart',source==='account'?'Your saved account cart is empty.':'Your browser cart is empty.');
  let lines;try{lines=normalizeQuoteLines({lines:selections});}catch{throw new CheckoutCartError('invalid_cart',`The cart cannot be reviewed. Check product options, quantities (1–${MAX_LINE_QUANTITY}) and the ${MAX_QUOTE_LINES}-selection limit.`);}
  const snapshot={source,...(profileId?{profileId,cartId}:{}),lines};return{...snapshot,fingerprint:fingerprint(snapshot)};
 }
 async function assertUnchanged(original,options){
  const current=await capture(original.source,{...options,expectedProfileId:original.profileId});
  if(current.profileId!==original.profileId)throw new CheckoutCartError('account_changed','Your account changed. Reload saved addresses and cart before reviewing.',409);
  if(current.fingerprint!==original.fingerprint)throw new CheckoutCartError('cart_changed','The cart changed during review. Check its current items and review checkout again.',409);
  return current;
 }
 return{capture,assertUnchanged};
}
