import { createServerClient } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

type SupabaseServerOptions = {
  cookies: AstroCookies;
};

/** Create a request-scoped Supabase client and persist refreshed auth cookies. */
export function createSupabaseServerClient({ cookies }: SupabaseServerOptions) {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          cookies.set(name, value, options);
        }
      },
    },
  });
}
