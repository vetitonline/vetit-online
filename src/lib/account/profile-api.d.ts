import type { APIRoute } from 'astro';
import type { authenticateApiRequest } from '../supabase/api-auth';
export function createProfileHandler(options: { authenticate: typeof authenticateApiRequest }): APIRoute;
