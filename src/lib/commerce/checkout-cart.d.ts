import type {QuoteRequestLine} from './checkout-quote.js';
import type {requestSavedCart} from '../buyer/saved-cart-client.js';
export class CheckoutCartError extends Error{code:string;status:number;constructor(code:string,message:string,status?:number);}
export type CheckoutCartSnapshot={source:'browser'|'account';profileId?:string;cartId?:string|null;lines:QuoteRequestLine[];fingerprint:string};
export function createCheckoutCartReader(options?:{readBrowser?:()=>string|null;readAccount?:typeof requestSavedCart}):{capture(source:'browser'|'account',options?:{signal?:AbortSignal;expectedProfileId?:string}):Promise<CheckoutCartSnapshot>;assertUnchanged(snapshot:CheckoutCartSnapshot,options?:{signal?:AbortSignal}):Promise<CheckoutCartSnapshot>};
