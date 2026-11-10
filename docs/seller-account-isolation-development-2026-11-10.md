# Seller account isolation checkpoint — 10 November 2026

Started on clean `codex/marketplace-accounts-2026-11-06` at `1438a3864f5f2dec3fae62b8d37a567265a97382`; GitHub's feature ref matched. Existing buyer accounts/address book, seller onboarding/catalogue, stock/cart/checkout, order tracking and customer cancellation are reused.

## Completed

Seller account intent is now enforced in addition to existing permissions and RLS. Previously, an old editor could submit under a newly signed-in account if both accounts held roles in the same business. The expected account is a precondition, never a role/ownership grant.

- Onboarding, business-edit, product-draft and submission forms carry one server-rendered `expected_profile_id`. Their endpoints compare it with the verified current account before any data query or write; missing, foreign, malformed or duplicate values fail closed with 409. Existing origin, field, role, business and publication checks remain.
- Shared catalogue writes and the older stock, fulfilment and photo-reservation mutations require `x-vetit-profile-id`. All built-in affected callers send the loaded identity. Callers of the older endpoints must now supply that header; a valid bearer token alone does not override the account precondition.
- Catalogue reads and acknowledgements include verified `profileId`. The shared client and native controller reject another account's response even if business IDs match. No token is persisted or placed in UI state.
- Seller dashboard/onboarding/product pages bind their private workspace to the server-rendered account. Normal token refresh for that account preserves edits. Account changes/sign-out clear private fields/views, disable detached forms, offer explicit reload and invalidate restored pages. An observed account switch during a draft save prevents subsequent photo reservations/uploads or navigation; an already-dispatched server operation cannot be recalled and must be reconciled by reloading.
- Legacy stock/shipment error text now describes uncertain results rather than claiming a write definitely did not occur. No retry/fallback mutation was added.

## Verification

- 234 selected application checks passed, covering actual route-source execution with synthetic clients, fresh onboarding/draft/moderation writes, shared-business account switches, missing/duplicate identity preconditions, native response/acknowledgement isolation, late draft acknowledgements, photo request identity, and existing buyer/account/catalogue/cart/checkout/order regressions.
- Isolated Chromium at desktop and mobile sizes passed against a synthetic rendered seller form with the **actual** account-guard module and application stylesheet. Same-account refresh preserves a dirty edit; account switch/sign-out removes private content and marks old controls invalid; no API write occurs. External browser traffic is blocked. This is not hosted SSR/Auth/Storage acceptance.
- Astro diagnostics: zero errors/warnings, 17 hints. SSR build and mobile TypeScript passed. No SQL, dependency version, lockfile, credential or environment setting changed; the unchanged PostgreSQL proposal suite was not unnecessarily repeated.

Run focused checks with `pnpm test:seller-account-isolation`. With local Astro on `127.0.0.1:4321`, use `pnpm test:seller-account-browser`.

## Remaining blockers

The previous dependency patches (`fast-uri` 3.1.9 and mobile `node-forge` 1.4.3) remain intact. The prior lockfile investigation found no compatible patch for the remaining `glob` 13→14, `minimatch` 10→11, mobile `uuid` 7→11 and mobile Expo CLI `zod` 3→4 advisories; `deepmerge` has no published fixed range. No forced major upgrade, suppression or repeated broad audit was performed. The prior findings were two web and five mobile, including one high in mobile CLI tooling; GitHub's main-branch alerts are separate and main remains unchanged.

Hosted Supabase Auth/PostgREST/RLS/Storage and native device acceptance remain unverified. Existing SQL proposals remain unapplied. Hosted order creation stays disabled pending explicit approval and trusted quote/repository, shipping/tax, payment verification/reconciliation, reservation expiry and operational rate-limit wiring. These local tests do not claim those launch dependencies are configured or operational.

No hosted database access/change, deployment, main merge, reset, deletion of existing work, production/configuration change or force-push is part of this checkpoint.
