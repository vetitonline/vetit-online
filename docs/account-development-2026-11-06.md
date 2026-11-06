# Account continuation — 6 November 2026

Development branch: `codex/marketplace-accounts-2026-11-06`.

The remote recovery checkpoint `codex/recovery-checkpoint-2026-10-21-1cfcc1b` was verified at `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`. It contains the checkout's original `00a064b2dae94a3d1b06222db9d3cddedac89edb` main commit. The clean development branch was advanced to the checkpoint using a fast-forward, preserving recovered catalogue, seller, buyer-order, moderation, appointment and mobile work. No reset, removal, main-branch update or remote write was performed.

## New account milestone

- `/account` provides display-name editing and links to orders, appointments, seller dashboard and cart. The header and native account screen link to it.
- `GET /api/account/profile` reads only the verified user's profile. `PATCH` accepts exactly `{ "fullName": "…" }` and updates only `full_name`. It never accepts a profile ID or role in the payload, changes sign-in credentials, creates missing profiles, or grants seller permissions.
- PATCH requires `X-Vetit-Profile-Id` to match the verified user. A form loaded for one account cannot update a subsequently signed-in account. Same-origin browser mutation checks and verified native bearer authentication reuse the existing API security boundary and RLS.
- The shared `requestProfile` transport supports browser cookies and native bearer sessions. Native profile editing currently hands off to the website; there is no new native profile form or credential storage.
- Profile responses and the account page are private and uncached. The page clears private fields on sign-in changes/page exit, suppresses stale results, and requires a reload after uncertain saves rather than retrying writes automatically.
- Names support Unicode/NFC and 1–100 code points. Only the display name is editable; verified phone/email and business verification remain separate workflows.

No SQL change is needed for this milestone: the canonical Test baseline already declares own-profile RLS and authenticated `full_name` column updates. This is a source contract, not proof of a hosted project's effective permissions.

## Local validation

Run from `/workspace/vetit-online` with `XDG_DATA_HOME=/workspace/.local/share`, `XDG_CACHE_HOME=/workspace/.cache` and `ASTRO_TELEMETRY_DISABLED=1`.

```sh
pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store
node --test tests/account-profile.test.mjs tests/account-page.test.mjs
node --test tests/auth-session-regression.test.mjs tests/buyer-order-history.test.mjs tests/native-buyer-orders.test.mjs tests/seller-catalogue.test.mjs tests/native-seller-catalogue.test.mjs
node --test tests/catalog-client.test.mjs tests/marketplace-workspace.test.mjs tests/marketplace-pages.test.mjs tests/seller-image-management.test.mjs tests/seller-draft-recovery.test.mjs tests/checkout-quote.test.mjs tests/native-checkout-review.test.mjs
pnpm check
pnpm build
```

The recovered order-page test harness omitted its real `resolveIndianLocale` dependency, causing three ReferenceErrors before assertions could run. The harness now injects the existing locale resolver; assertions and application behavior are unchanged.

Results in this cloud instance: all **122 selected tests passed**, including 15 new account tests. `pnpm check` completed with zero errors, zero warnings and 15 informational hints; `pnpm build` passed. Six local HTTP checks confirmed the account page's private cache/referrer headers, catalogue/order page rendering, expected unavailable responses from the unconfigured profile API and seller dashboard, and rejection of cross-origin profile mutation. New account tests can also be run with `pnpm test:account`.

## Remaining work and boundaries

No hosted database, Auth, Storage or migration operation was executed. There are no configured Supabase bindings in this cloud instance. Real profile persistence, OTP, seller session/Storage acceptance and order history against hosted RLS remain unverified. The recovered code restricts Supabase clients to the designated Test project. Consult the recovered backend migration sequence and Test correction handover before any approved database work; do not replay the legacy initial migration.

Operational checkout/order placement, payment processing, delivery/returns operations and native device acceptance remain outstanding. The recovered checkout is quote-only, payment gates remain intact, and order history does not create orders. A native web handoff does not transfer the preview cart or tokens.

Continue from this branch. Production changes, deployments, merges into main and live Supabase mutations require the user's approval. No push or deployment was made in this batch.
