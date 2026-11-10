import type { APIRoute } from 'astro';
import type { authenticateApiRequest } from '../supabase/api-auth';
export function createBuyerOrderCancelHandler(options:{authenticate:typeof authenticateApiRequest}):APIRoute;
