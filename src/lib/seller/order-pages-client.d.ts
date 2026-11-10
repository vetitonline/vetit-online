import type {SellerOrderSnapshot} from './order-groups.js';
export type SellerOrderPage=SellerOrderSnapshot&{pagination:{scope:string;limit:number;nextCursor:string|null}};
export function normalizeSellerOrderPage(value:unknown):SellerOrderPage;
export function mergeSellerOrderPages(previous:SellerOrderPage|undefined,next:SellerOrderPage):SellerOrderPage;
type Options={baseUrl?:string;accessToken?:string;profileId?:string;cursor?:string;signal?:AbortSignal;fetchImpl?:typeof fetch};
export function requestSellerOrderPage(options?:Options&{fulfilmentId?:undefined}):Promise<SellerOrderPage>;
export function requestSellerOrderPage(options:Options&{fulfilmentId:string}):Promise<{apiVersion:1;state:'available';profileId:string;scope:string;fulfilment:SellerOrderSnapshot['fulfilments'][number]}>;
