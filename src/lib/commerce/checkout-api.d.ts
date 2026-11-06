import type { APIRoute, AstroCookies } from 'astro';
import type { authenticateApiRequest } from '../supabase/api-auth';
export function createCheckoutHandler(options:{authenticate:typeof authenticateApiRequest;dependencies:(auth:Extract<Awaited<ReturnType<typeof authenticateApiRequest>>,{state:'authenticated'}>,request:Request,cookies:AstroCookies)=>Promise<import('./checkout-service.js').OrderDependencies>;createOrder?:boolean;orderCreationEnabled?:boolean}):APIRoute;
