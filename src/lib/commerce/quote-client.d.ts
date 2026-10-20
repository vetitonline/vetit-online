import type { QuoteRequestLine, CheckoutQuoteResponse } from './checkout-quote.js';
export class QuoteClientError extends Error {status:number; constructor(status:number);}
export function requestCheckoutQuote(lines:QuoteRequestLine[], options?:{baseUrl?:string; fetchImpl?:typeof fetch; signal?:AbortSignal;accessToken?:string}):Promise<CheckoutQuoteResponse>;
