import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://vetit.online",
  output: "server",
  adapter: vercel(),
  vite: {
    ssr: {
      noExternal: ["@supabase/ssr", "@supabase/supabase-js"],
    },
  },
});
