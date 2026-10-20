import type {NativeModerationSession} from './moderation-session.js';import type {CheckoutQuoteResponse,QuoteRequestLine} from '../../src/lib/commerce/checkout-quote.js';
export type NativeQuoteState={phase:'idle'|'loading'|'signin'|'error'|'ready';quote:CheckoutQuoteResponse|null};
export function createNativeCheckoutReview(options:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;lines:QuoteRequestLine[];render:(state:NativeQuoteState)=>void}):{run():Promise<void>;clear():void;dispose():void};
