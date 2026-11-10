import type {OrderItem,OrderFulfilment} from '../buyer/order-contract.js';
export type SellerOrderSnapshot={apiVersion:1;state:'available';profileId:string;items:Array<OrderItem&{orderId:string}>;fulfilments:Array<OrderFulfilment&{orderId:string}>};
export type SellerOrderGroup={key:string;orderId:string;businessId:string;items:SellerOrderSnapshot['items'];fulfilments:SellerOrderSnapshot['fulfilments'];currencyCode:string|null;subtotalMinor:number|null};
export function normalizeSellerOrders(input:unknown,options?:{maxRecords?:number}):SellerOrderSnapshot;
export function groupSellerOrders(input:SellerOrderSnapshot,filters?:{query?:string;status?:string}):SellerOrderGroup[];
