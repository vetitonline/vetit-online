# Atomic checkout checkpoint — 6 November 2026

Branch: `codex/marketplace-accounts-2026-11-06`, continuing `65b0529f63ee570d42ff46aa48d0ae66e8278729`.

## Implementation and approval boundary

`supabase/test-project/20261106160000_atomic_checkout.proposal.sql` is an additive **Test-only review proposal**, outside the legacy automatic migration chain. It was applied only to new disposable local PostgreSQL containers. No hosted SQL, production configuration, credential, or deployment operation occurred. `HOSTED_ORDER_CREATION_ENABLED` remains `false`; the order API also defaults disabled even when an order repository is injected. Applying the SQL alone cannot enable hosted checkout.

- Only a trusted service worker can issue a short-lived quote. SQL resolves product prices, seller, category, market, option attributes and SKU; shipping/tax charges come from the trusted worker. A customer cannot supply authoritative prices, seller IDs or fees.
- Customer placement checks quote ownership, canonical request, consent total, expiry and current catalogue eligibility. Prices are resolved again after inventory contention, including scheduled price expiry. Price writes serialize on the parent listing to prevent new versions slipping past the checkout validation boundary.
- Placement creates the order, immutable line snapshots, per-seller fulfilments, shipment lines, reservations, idempotency record and event in one PostgreSQL transaction. Default-location inventory rows are locked in global ID order. Insufficient or wrongly owned stock aborts the entire transaction; no partial order/reservation remains.
- Idempotency is scoped to customer and key, and bound to the original quote/request/total. Successful replay occurs before offer expiry/current-price checks and never reserves twice. The JavaScript repository and checkout service reconcile an existing attempt before repricing or preparing another payment. Replays return HTTP 200; new creation returns 201.
- Customers can atomically cancel their own unpaid pending checkout, releasing reserved stock once. Captured/authorized payments prevent cancellation. Only the service role can confirm an order, and the database requires a captured payment row matching customer, amount and currency. Snapshots and invalid status jumps are rejected.
- Operational sellers use `advance_checkout_fulfilment`, which locks the order before the existing scoped fulfilment RPC. Dispatch consumes reserved/on-hand stock and records the movement atomically; delivery completion requires all shipments delivered and reservations consumed. Catalogue-only and unrelated users cannot manage shipments. The application prefers this wrapper, falling back to the legacy RPC only for PostgREST's missing-function error, never after a rejection or uncertain write.
- Private quote/reservation/idempotency/event tables have RLS and no client or service-role direct table grants. Public RPC execution is explicitly scoped by role. Inventory itself remains private. The existing deferred totals trigger is hardened to run as its owner with an empty search path, fixing service-worker confirmation without granting broader table access.

## Actual database verification

Run `pnpm test:checkout-db`. This explicit target starts a unique PostgreSQL 17 container on the managed **local Docker socket**, with `--network=none`, no published ports, bounded resources and tmpfs-only database storage. It accepts no database URL or remote Docker context. It stops only its own generated container. The official image is pinned by digest.

The test composes the canonical baseline, private-business-fields, seller foundation, seller hardening, existing commerce proposal and new checkout proposal. Auth/Storage compatibility fixtures are local stand-ins for Supabase; actual JWT issuance, PostgREST and hosted Storage are not tested.

**18 database scenarios passed**: atomic snapshots, duplicate-key races, competing customers/last stock, opposite cart lock order, late stock failure, explicit rollback, downstream trigger failure, quote expiry after waiting, price expiry after waiting, role/privacy boundaries, tampered totals/address/options, stale prices, seller/category withdrawal, wrong-seller inventory, cancellation/replay, paid shipment lifecycle, JavaScript-to-real-SQL integration and shipment rollback. Catalogue correction fixtures temporarily bypass only the historical seller price guard as an owner; the new price-serialization trigger remains active. This is not a claim of a full seller catalogue-edit acceptance run.

`pnpm test:checkout-repository` covers default-off adapters, bounded trusted quotes, owned response validation, error sanitization, no automatic write retry, cancellation, expiry-safe reconciliation, HTTP replay semantics and safe legacy fallback. The selected application/adapter regression run passed **135 tests**. Astro diagnostics reported zero errors/zero warnings (15 informational hints), mobile TypeScript and the SSR build passed.

## Remaining launch prerequisites

1. Review and explicitly approve the Test migration/release sequence and hosted deployment separately. Do not run a blanket `supabase db push`; preserve the historical ledger and exclude legacy foundation migrations.
2. Exercise real Supabase Auth/PostgREST/RLS/service-worker wiring and hosted concurrency acceptance. The server repository and quote issuer are dependency-injected and remain unconfigured in the runtime.
3. Configure authoritative shipping/tax services and the trusted quote issuer, rate limiting, payment verification/reconciliation and approved reservation-expiry/abandoned-checkout policy. No worker, automatic expiry job or live payment path was activated here.
4. Decide the stock model for base products and non-default warehouses before enabling those lines. This implementation rejects untracked base products and reserves only the explicit variant/default-location stock model already present in the schema.

Existing customer accounts, saved/browser carts, catalogue, order history, seller interfaces and environment settings were preserved. No reset, deletion of existing work/data, main merge or force-push is part of this checkpoint.
