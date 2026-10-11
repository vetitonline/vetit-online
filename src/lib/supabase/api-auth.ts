import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';
import { parseBearerAccessToken } from './auth-token.js';
import { getSupabasePublicConfig } from './config';
import { createSupabaseServerClient } from './server';

export type AuthenticatedApiRequest =
  | { state: 'authenticated'; supabase: SupabaseClient<Database>; user: User }
  | { state: 'unauthenticated' }
  | { state: 'unavailable' };

export async function authenticateApiRequest(
  request: Request,
  cookies: AstroCookies,
): Promise<AuthenticatedApiRequest> {
  const config = getSupabasePublicConfig();
  if (!config) return { state: 'unavailable' };
  const authorization = request.headers.get('authorization');
  try {
    if (authorization !== null) {
      const token = parseBearerAccessToken(authorization);
      if (!token) return { state: 'unauthenticated' };
      const supabase = createClient<Database>(config.url, config.publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      return error || !user ? { state: 'unauthenticated' } : { state: 'authenticated', supabase, user };
    }

    const supabase = createSupabaseServerClient({ request, cookies });
    const { data: { user }, error } = await supabase.auth.getUser();
    return error || !user ? { state: 'unauthenticated' } : { state: 'authenticated', supabase, user };
  } catch {
    return { state: 'unavailable' };
  }
}
