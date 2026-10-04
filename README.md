# Vetit Online

AI-powered pet, livestock and services marketplace.

## Foundation setup

- Runtime: Astro SSR with the Vercel adapter. Deployments are not performed by this project setup.
- Database/auth/storage: Supabase. Create the Supabase project in **Mumbai (`ap-south-1`)** before applying migrations. Region is selected when creating the hosted project; it cannot be changed in place.
- Apply SQL migrations in `supabase/migrations/` with the Supabase CLI or SQL editor.
- Copy `.env.example` to `.env` for local development and set the Supabase project URL and publishable key. No production credentials are required to build the project.
- The homepage reads up to four published India product listings from Supabase. When local Supabase settings are absent, it retains the existing homepage sample cards; when configured but the database is empty, it shows a styled empty state.
- The generated-style TypeScript schema subset used by the app is in `src/lib/supabase/database.types.ts`. Keep it in sync with future migrations (or replace it with Supabase CLI-generated types once the project is linked).
- Email and phone OTP client/server helpers live under `src/lib/auth/`. Configure an SMS provider in Supabase Auth later; provider delivery is intentionally not coupled to application code.
- Razorpay Route is represented by a server-only, disabled-by-default integration boundary under `src/lib/payments/`. Live payment processing remains blocked until Vetit completes Razorpay onboarding and Route eligibility is confirmed.

Run `pnpm dev` for local development and `pnpm build` to produce the Vercel SSR build.
    AI-powered pet, livestock and services marketplace
