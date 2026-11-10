# Seller-order pagination checkpoint — 10 November 2026

Verified a clean `codex/marketplace-accounts-2026-11-06` at pushed checkpoint `b7673c2120d119bea320119fdb187947b988b912`. Existing checkout, order transactions, stock and customer flows are preserved.

## Implemented

- `/api/seller/orders?paginate=1&limit=50` adds independent bounded keyset streams for item lines and shipments. Supported limits are 1–100 per stream; each query reads only limit+1 rows. Sorting uses descending `created_at` plus UUID to handle ties and retains PostgreSQL microsecond timestamps. Completed streams are not queried again. No offsets, unbounded reads or silent truncation are used.
- Cursors contain validated positions, page size, verified profile ID and a SHA-256 fingerprint of the current active operational business scope. They are not authorization tokens: every request re-verifies the user, permitted membership, active business scope and RLS. Changed identity/access fails closed before historical record reads. Malformed/duplicate cursor inputs cannot become arbitrary PostgREST filters.
- The seller dashboard loads records incrementally, reports loaded counts, labels partial subtotals explicitly, and makes search/status filters explicitly apply to loaded records. Additional pages must match the same account/scope. Duplicate IDs are merged; repeated cursors fail closed. Account changes and failed page reads clear private records rather than mixing contexts.
- An owned `fulfilmentId` lookup verifies one current shipment after mutation. Records on later pages can now be managed without depending on their presence in the first-page response. Existing mutation origin/account checks, confirmation and atomic backend transition authority remain in place.
- Shared JS client/contracts support cookie-backed web and bearer-backed native callers. The existing non-paginated API remains compatible with its former fail-closed 200-record bound; the web dashboard uses the new explicit mode.

## Validation

251 application tests passed, including eight new pagination checks and existing marketplace/account/cart/checkout/order/native regressions. New coverage traverses 251 records in each stream once, tests timestamp ties, finished streams, malformed cursors/filter injection, changed account/scope, revoked membership, inactive businesses, historical owned lookup, repeated-cursor rejection and bearer transport isolation.

26 scenarios passed in disposable PostgreSQL 17 with the existing canonical migration/proposal sequence. The additional actual-handler/client test bridges its generated queries into seller-scoped PostgreSQL transactions, traverses 251 real item rows under RLS with identical microsecond timestamps, and verifies that a non-seller receives no seller rows. Local Auth compatibility functions stand in for hosted Supabase; this does not verify real PostgREST/JWT behavior.

Isolated Chromium desktop/mobile tests passed for loading 251 item lines and 251 shipments, partial versus complete subtotals, updating a historical shipment with direct readback, scope revocation, account clearing and viewport fit. The prior saved-cart review/grouped-shipment browser regression also passed. APIs and identity are synthetic; external browser requests are blocked.

Astro diagnostics reported zero errors/warnings; mobile TypeScript and SSR build passed. Run `pnpm test:seller-pagination`, `pnpm test:checkout-db`, or, with local Astro on port 4321, `pnpm test:seller-pagination-browser`.

## Limits and remaining launch blockers

The dashboard intentionally holds at most 5,000 records per stream and shows a display-limit message instead of fetching indefinitely. The API can continue beyond that bound for other clients. The pre-existing 200-business operational scope bound remains. Search is over loaded records, not a server-wide historical search. Pagination is not a database snapshot: records created ahead of an existing cursor require reload; existing shipment statuses may change and are rechecked before displaying mutation success. Production-scale query plans/indexing and hosted access acceptance still need validation in the approved Test environment.

This milestone addresses seller-order pagination only. Shipping/tax provider bindings and authoritative rates, trusted checkout quote/repository wiring, reservation-expiry policy/worker, distributed rate limiting, payment verification/reconciliation and native device acceptance remain launch work. Existing SQL proposals remain unapplied and hosted order creation stays disabled. Previously documented dependency advisories remain unresolved where compatible upstream fixes are unavailable.

No source SQL, dependencies, lockfiles, production settings or credentials changed. No hosted Supabase access/change, deployment, merge, reset, deletion of existing work or force-push occurred.
