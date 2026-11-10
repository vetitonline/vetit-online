# Customer order cancellation and dependency patches — 10 November 2026

Verified `codex/marketplace-accounts-2026-11-06` at `7ecf840889f00df89c98bb7a8edd96128f875e0d`, with a clean working tree and matching GitHub feature ref. The previously reported edited files were already committed and pushed. No recovery/reset was necessary.

## Functional milestone

- Customer order details now offer explicit confirmed cancellation for a pending order with verified account identity. Existing history, item prices and tracking remain intact. English is the default; new copy also has Hindi translations and existing unsupported-language fallback.
- Shared `/api/buyer/orders/cancel` POST and browser-cookie/native-bearer client require the expected account, guard cookie origins, bound/validate input, preflight parent ownership with the user's Supabase client, and invoke only the existing `cancel_my_checkout_order` transaction. No service key, direct status update, refund, automatic retry or legacy fallback is introduced.
- The backend remains authoritative for current state/payment eligibility. Its existing atomic transaction releases reservations and cancels fulfilments. Authorized/captured payment, shipped or non-pending orders cannot use this cancellation path. Existing cancelled orders reconcile idempotently. Legacy orders without atomic-checkout records fail closed.
- The UI suppresses duplicate taps, confirms fresh customer-scoped order/fulfilment readback, and clears uncertain results until explicit reload. Sign-in/out changes clear private order data and invalidate in-flight requests. Pagination cannot combine responses from different verified identities.
- Order history adds an optional `profileId` field without breaking older clients/responses; older details without verified identity stay read-only. The native app retains its existing order UI and can use the shared cancellation API in a future native control.

## Dependency investigation

GitHub reported ten alerts on its **default branch** during the previous push. Its alert API returned `Forbidden` in this environment, so the exact private default-branch alert list could not be retrieved. Registry audits of both current lockfiles supplied actionable package paths. Mobile must be audited with `pnpm --ignore-workspace --dir mobile audit --json`; plain `pnpm audit` within its directory selects the enclosing root workspace and misses the separate mobile graph.

Only in-range patch updates were made, without framework/SDK upgrades, forced overrides or suppression:

| Lockfile | Patch | Audit findings before → after |
| --- | --- | --- |
| Web | `fast-uri` 3.1.8 → 3.1.9 | 6 → 2 (four findings removed) |
| Mobile | `node-forge` 1.4.0 → 1.4.3 | 17 → 5 (twelve findings removed, including six high) |

Remaining registry advisories:

- `glob` GHSA-3g3m-2fjr-6pw4: fixed at 14.0.2; installed 13.0.6 in both graphs. The current latest `@vercel/nft` still requests glob 13.
- `minimatch` GHSA-g3hv-75wg-m249: fixed at 11.0.1; installed 10.2.6 in both graphs.
- Mobile `uuid` GHSA-w5hq-g745-h8pq: fixed at 11.1.1; installed 7.0.3 through Expo's Xcode tooling.
- Mobile `zod` GHSA-mrhx-c7xc-m3w5: fixed at 4.6.6; installed 3.25.76 through Expo CLI (one remaining high).
- Mobile `deepmerge` GHSA-gcqx-w48m-w2h4: no published fixed range.

The remaining version changes cross major APIs or lack a fix; defer them to an explicitly tested tooling/SDK upgrade. No claim is made that GitHub's default-branch alerts have closed: main was not changed.

## Validation

- 218 application tests: cancellation API/transport/controller/security plus account/address, customer variants/cart/checkout, seller catalogue/images/inventory/orders and native regressions. All passed.
- 25 scenarios on disposable PostgreSQL 17 with the existing canonical migration/proposal sequence. New HTTP-handler integration verifies parent ownership/RLS, duplicate cancellation, stock released once and visible again to customers, downstream rollback and authorized-payment rejection. Existing atomic concurrency, inventory and checkout tests also passed. Local Auth/Storage stand-ins do not verify hosted JWT/PostgREST integration.
- Isolated Chromium desktop/mobile cancellation flow with synthetic identity/API fixtures and blocked external requests passed; existing seller-inventory → saved-cart → checkout browser flow passed again. Confirmation rejection performs no write; late payment conflict requires reload; account changes remove private details.
- Astro diagnostics: zero errors/warnings (17 hints). SSR build and mobile TypeScript passed. Both frozen lockfile installations succeeded using the existing package store. Expo public config parsed offline; its actual code-signing library generated, validated and round-tripped a synthetic X.509 certificate and signed/verified a test buffer using node-forge 1.4.3. No signing material was persisted or published.

Reproduce cancellation checks with `pnpm test:order-cancellation`, `pnpm test:checkout-db`, and (local Astro on port 4321) `pnpm test:order-cancellation-browser`.

## Launch blockers

Existing Supabase proposals remain unapplied; cancellation requires the reviewed atomic-checkout backend and otherwise returns unavailable. Hosted Auth/PostgREST/RLS acceptance remains outstanding. Hosted order creation stays disabled. Trusted quote/repository wiring, authoritative shipping/tax, payment verification/reconciliation, reservation-expiry policy, operational rate limiting and native device acceptance remain prerequisites. Remaining dependency advisories above need a compatible upstream/tooling upgrade.

No production configuration, live database, migration application, deployment, main merge, repository reset, deletion of existing work or force-push occurred.
