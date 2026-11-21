import type {APIRoute} from 'astro';
import type {authenticateApiRequest} from '../supabase/api-auth';
export function createAdminOrdersHandler(options:{authenticate:typeof authenticateApiRequest}):APIRoute;
