import type { SupabaseClient } from '@supabase/supabase-js';
export function createSessionController(options: {
  auth: SupabaseClient['auth'];
  location: Pick<Location, 'pathname' | 'search' | 'origin' | 'replace'>;
  render: (signedIn: boolean) => void;
}): { check(): Promise<void>; logout(): Promise<void>; dispose(): void };
