import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import type { OrderDependencies } from './checkout-service.js';
import type { OrderSummary } from '../buyer/order-contract.js';
export function createPostgresOrderRepository(client:SupabaseClient<Database>,options?:{approved?:boolean;quoteId?:string}):NonNullable<OrderDependencies['repository']>&{cancelOrder(input:{orderId:string;customerId:string}):Promise<OrderSummary>};
export function issuePostgresCheckoutQuote(client:SupabaseClient<Database>,input:unknown,options:{approved?:boolean;customerId:string;deliveryMinor:number;taxMinor:number;rateReference:string;ttlSeconds?:number}):Promise<{id:string;subtotalMinor:number;deliveryMinor:number;taxMinor:number;totalMinor:number;currencyCode:'INR';expiresAt:string}>;
