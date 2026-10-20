import type {OrderSummary,OrderItem,OrderFulfilment} from './order-contract.js';
export {BuyerOrderError} from './order-contract.js';
export type OrderHistory={apiVersion:1;state:'available';orders:OrderSummary[];nextCursor:string|null};
export type OrderDetail={apiVersion:1;state:'available';order:OrderSummary;items:OrderItem[];fulfilments:OrderFulfilment[];truncated:boolean};
type Options={baseUrl?:string;limit?:number;cursor?:string;accessToken?:string;signal?:AbortSignal;fetchImpl?:typeof fetch};
export function requestBuyerOrders(options:Options&{orderId:string}):Promise<OrderDetail>;
export function requestBuyerOrders(options?:Options&{orderId?:undefined}):Promise<OrderHistory>;
