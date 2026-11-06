import type { APIRoute } from 'astro';
import type { authenticateApiRequest } from '../supabase/api-auth';
import type { callProposedCommerceRpc } from '../supabase/proposed-commerce-rpc';
export function createSellerOrdersHandler(options:{authenticate:typeof authenticateApiRequest;rpc:typeof callProposedCommerceRpc}):APIRoute;
export function fulfilmentActions(status:string):string[];
