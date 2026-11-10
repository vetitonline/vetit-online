import type {SavedCart} from './saved-cart-contract.js';
import type {requestSavedCart} from './saved-cart-client.js';
import type {requestCheckoutQuote} from '../commerce/quote-client.js';
import type {CheckoutQuoteResponse} from '../commerce/checkout-quote.js';
export type CartPriceReview={phase:'idle'|'loading'|'ready'|'error';enabled:boolean;quote:CheckoutQuoteResponse|null;message:string};
export function createCartPriceReview(options:{read?:typeof requestSavedCart;quote?:typeof requestCheckoutQuote;render:(state:CartPriceReview)=>void}):{setCart(cart:SavedCart|null):void;review():Promise<void>;dispose():void};
