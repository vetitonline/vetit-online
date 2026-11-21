import type {createCheckoutRateIssuer} from './checkout-rates.server.js';
export type SandboxChargePolicy={reference:string;deliveryPerSellerMinor:number;taxBasisPoints:number;taxShipping:boolean;quoteTtlSeconds:number;postalPrefixes:string[]};
type IssuerOptions=Parameters<typeof createCheckoutRateIssuer>[0];
export function createSandboxChargeProviders(options:{approved?:boolean;policy:SandboxChargePolicy;now?:()=>number}):Pick<IssuerOptions,'shipping'|'taxes'>;
