export class BuyerOrderError extends Error {status:number;constructor(message:string,status?:number);}
export type OrderSummary={id:string;market_code:string;order_status:'pending'|'confirmed'|'processing'|'fulfilled'|'cancelled'|'refunded';currency_code:string;subtotal_minor:number;delivery_minor:number;tax_minor:number;total_minor:number;created_at:string};
export type OrderItem={id:string;listing_id:string;business_id:string;product_variant_id:string|null;title_snapshot:string;quantity:number;unit_price_minor:number;currency_code:string};
export type OrderFulfilment={id:string;business_id:string;status:'pending'|'packed'|'shipped'|'delivered'|'cancelled';carrier:string|null;tracking_reference:string|null;shipped_at:string|null;delivered_at:string|null};
export function orderId(value:unknown):string;
export function encodeOrderCursor(row:Pick<OrderSummary,'id'|'created_at'>):string;
export function normalizeOrderHistoryQuery(params:URLSearchParams):{orderId:string}|{limit:number;cursor:{createdAt:string;id:string}|null};
export function normalizeOrderSummary(value:unknown):OrderSummary;
export function normalizeOrderItem(value:unknown,currency:string):OrderItem;
export function normalizeOrderFulfilment(value:unknown):OrderFulfilment;
