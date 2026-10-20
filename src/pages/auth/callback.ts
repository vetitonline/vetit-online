import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { completeAuthCallback } from '../../lib/auth/callback.js';

export const prerender = false;
export const GET: APIRoute = async ({ request, cookies }) => {
  return completeAuthCallback(request.url, code =>
    createSupabaseServerClient({ request, cookies }).auth.exchangeCodeForSession(code));
};
