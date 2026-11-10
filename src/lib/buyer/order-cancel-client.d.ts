import type {OrderSummary} from './order-contract.js';
export function requestBuyerOrderCancellation(options:{orderId:string;profileId:string;baseUrl?:string;accessToken?:string;signal?:AbortSignal;fetchImpl?:typeof fetch}):Promise<{apiVersion:1;state:'cancelled';profileId:string;order:OrderSummary}>;
