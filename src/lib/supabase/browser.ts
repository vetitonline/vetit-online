import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/** Create the browser client lazily so static assets/builds need no credentials. */
export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createBrowserClient<Database>(config.url, config.publishableKey);
}
