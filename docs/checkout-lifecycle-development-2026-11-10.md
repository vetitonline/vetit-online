# Shipping/tax, payment reconciliation and reservation lifecycle — 10 November 2026

Continues clean, pushed `4520673ab8883b26fe26aa8fc880dd1caefacd68` on `codex/marketplace-accounts-2026-11-06`. Existing checkout normalization, authoritative price resolution, atomic order/reservation creation, cancellation, confirmation and fulfilment transitions are reused.

## Implemented (sandbox only, not activated)

`checkout-rates.server.js` bridges explicitly supplied sandbox shipping/tax providers to the existing trusted PostgreSQL quote issuer. It first obtains a server-resolved item basis with seller IDs, variants, quantities and prices. Tax quoting receives the shipping charge as well. Caller charge/authority fields are ignored; there are no invented rates, free-shipping defaults or implicit tax exemptions. Finalization resolves the items again, rejects any changed price/owner/snapshot, stores provider references, and caps the DB quote at the providers' absolute expiry. Charges must use INR and safe integer minor units. The future server boundary must supply the independently verified customer ID.

An explicit reservation TTL (60–86,400 seconds, a technical bound rather than an approved business policy) is required for the new rated path. Rated orders enroll **inside the existing reservation transaction**, so a crash before payment preparation cannot leave those reservations unmanaged. The deadline starts from the real pending/reservation event timestamp, not transaction-start time or quote expiry. Policy cannot be extended by replay. Legacy quotes/orders retain their existing behavior and are not silently backfilled; trusted explicit enrollment is available only for fresh unpaid tracked orders.

`checkout-lifecycle.server.js` provides a service-only sandbox worker:

- Payment attempts register before the provider call and have one stable idempotency key per order. Unknown/late create responses are never treated as failure or automatically retried. An explicit recovery call reuses the registered key. The provider must honor that key; an unresolved `starting` attempt keeps stock protected.
- Reconciliation independently fetches verified provider status for the registered order/attempt/reference. Event IDs and provider event timestamps must remain stable for the same observation; a timestamp is not the polling time. Verified captures update payment proof and confirm the matching order in one transaction. Duplicate observations replay safely; conflicting event reuse is refused. Amount/currency mismatch and late captures persist as manual-review evidence.
- Due batches independently recheck current eligibility under the order lock. Unpaid orders without an attempt, or orders with verified terminal failed/cancelled attempts, can release stock through the existing atomic cancellation path. Starting, pending, authorized and review-required payments remain reserved. Customer cancellation follows the same protection. Capture/expiry races never reopen cancelled orders or reacquire released stock.
- Failed transactions roll back payment/order/observation/stock changes together. Registered payment identity and status progression are guarded. Review-required payments block dispatch. No refund or provider-side payment cancellation is executed.
- A bounded, paginated service-only review queue includes closed orders with late captures; capture evidence is prioritized. Due checks rotate blocked candidates fairly. Provider calls have bounded, abortable deadlines with no automatic retry; unknown status cannot authorize release.

All new persistence and RPCs are in additive **unapplied** `supabase/test-project/20261110130000_checkout_lifecycle.proposal.sql`, outside the automatic migration directory. New tables remain private with RLS and no direct client/service-role table grants; trusted RPC execution is restricted to `service_role`. Provider verification is the trusted worker adapter's responsibility, not a browser-asserted paid flag. The module reads no credentials and exposes no public webhook or worker endpoint.

## Verification

- **267 application tests passed**, including 16 new lifecycle/charge/timeout tests and existing account, seller, catalogue, cart, checkout, orders and native regressions.
- **38 scenarios passed on disposable PostgreSQL 17** using the canonical baseline and existing proposal sequence plus this proposal. New cases cover RPC privacy, immutable deadlines, atomic enrollment/rollback, concurrent expiry, payment-blocked cancellation, replayed captures, failed capture rollback, wrong amounts/currencies, late captures, capture/expiry races, dispatch protection, worker outage behavior, review pagination and provider-expiry/price-basis binding. The runner uses a pinned image, no external network and no hosted DB URL.
- Astro diagnostics: zero errors/warnings. Mobile TypeScript and SSR build passed. This is a backend milestone; no new browser payment UI is enabled. Local Auth compatibility fixtures and sandbox providers do not verify hosted JWT/PostgREST or real carrier/tax/payment services.

Run `pnpm test:checkout-lifecycle` and `pnpm test:checkout-db`. No new dependency, lockfile, credential or environment configuration is required for those isolated tests.

## Remaining launch work

1. Choose/configure real shipping, tax and payment providers, including authoritative tax classifications/origins/rules and approved reservation durations. Implement and accept-test their authenticated status/quote adapters. The current constructors deliberately reject live mode.
2. Review and explicitly approve the Test proposal/migration sequence and hosted release separately. Do not run a blanket database push. Hosted Auth/PostgREST/RLS/Storage and production-scale query/lock behavior remain unverified.
3. Wire the new rated quote path, transactional repository, payment preparation/recovery and a scheduled privileged reconciliation/expiry worker. All payment paths must register before external creation; legacy unenrolled orders are excluded from expiry. The issuer and worker must use the same immutable TTL policy. No scheduler, cron entry or hosted instance was configured.
4. Add verified provider webhook/event intake and operational polling, including delivery of late events for already-closed orders. Implement audited manual-review resolution/refund-proof workflows and an operator interface; this checkpoint retains evidence but never issues refunds or clears review flags automatically.
5. Distributed rate limiting, operational monitoring, native device acceptance and previously documented dependency upgrades remain launch blockers. Hosted order creation stays disabled in `runtime-checkout.ts`.

No hosted database access/change, migration application, production configuration change, deployment, merge, reset, deletion of existing work or force-push occurred.
