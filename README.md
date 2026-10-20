# Vetit Online

AI-powered pet, livestock and services marketplace.

## Foundation setup

- Runtime: Astro SSR with the Vercel adapter. Deployments are not performed by this project setup.
- Database/auth/storage: use the existing isolated Supabase **Test** project `apfyfmokcynqiaxqvvxx`. This candidate rejects other configured Supabase URLs, including during builds/previews. No new hosted project or production access is needed.
- Six corrections are prepared but unapplied. Use the reviewed Test release manifest and historical aliases only after explicit approval. Do **not** blanket-apply the root migration directory, replay foundations or repair history. The supplemental rejected-listing resubmission proposal is outside the six-file release and still needs PostgreSQL validation and versioning.
- Use `.env.example` as a reference; never overwrite an existing environment/credential file. Set the existing Test publishable key locally, never a service-role/secret key. Non-secret `.env.development.local` endpoint settings alone do not make authentication ready. `pnpm check:test-config` performs an offline, value-redacted readiness check; exit 2 means incomplete configuration. Hosted Auth messages/fixtures and redirect-allowlist changes require separate approval.
- The homepage reads up to four published India product listings from Supabase. When local Supabase settings are absent, it retains the existing homepage sample cards; when configured but the database is empty, it shows a styled empty state.
- The generated-style TypeScript schema subset used by the app is in `src/lib/supabase/database.types.ts`. Keep it in sync with future migrations (or replace it with Supabase CLI-generated types once the project is linked).
- Email and phone OTP client/server helpers live under `src/lib/auth/`. Configure an SMS provider in Supabase Auth later; provider delivery is intentionally not coupled to application code.
- Razorpay Route is represented by a server-only, disabled-by-default integration boundary under `src/lib/payments/`. Live payment processing remains blocked until Vetit completes Razorpay onboarding and Route eligibility is confirmed.

Run `pnpm dev` for local development and `pnpm build` to produce the Vercel SSR build.
    AI-powered pet, livestock and services marketplace
