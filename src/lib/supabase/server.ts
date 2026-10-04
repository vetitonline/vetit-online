import { createServerClient } from "@supabase/ssr";
import type { AstroCookies } from "astro";

type SupabaseServerOptions = {
  cookies: AstroCookies;
};

/** Create a request-scoped Supabase client and persist refreshed auth cookies. */
export function createSupabaseServerClient({ cookies }: SupabaseServerOptions) {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createServerClient(url, publishableKey, {
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
