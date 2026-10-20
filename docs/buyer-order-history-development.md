# Buyer order-history backend batch — 15 October 2026

## Scope and resource decision

Reviewed current API routes, buyer quote/cart flow, admin entry point, existing order schemas/RLS, appointment client/worker and the appointment validation reports. Preserved all pre-existing changes. Available memory was **255 MiB**, below the established 256 MiB SQL retry threshold; the isolated D: cluster was stopped. No PostgreSQL restart/recovery, Windows/pagefile change or heavy build was attempted.

Chosen batch: a missing **read-only buyer order-history/detail backend**, reusing existing normalised tables and authenticated Supabase query infrastructure. This does not enable order creation or payment processing. No Supabase connection or migration was performed.

## Completed changes

- `src/pages/api/buyer/orders.ts`: authenticated GET route using existing verified cookie/bearer authentication. Anonymous/unavailable authentication fails closed.
- `src/lib/buyer/order-history.js` and `.d.ts`: customer-scoped summaries and owned-order details. Explicit verified-user filtering supplements existing RLS; caller-supplied customer identities do not control scope. Child records are queried only after parent ownership. Foreign/missing orders return the same 404.
- `src/lib/buyer/order-contract.js` and `.d.ts`: bounded pagination (default 20, maximum 50), timestamp/UUID cursor validation, preserved PostgreSQL microsecond precision and deterministic timestamp/UUID tie-breaking. Saved totals use safe-integer validation and BigInt consistency checks; no repricing.
- `src/lib/buyer/orders-client.js` and `.d.ts`: shared web/mobile HTTP client with cookie/bearer options, cancellation signal, uncached reads, safe sparse HTTP-error handling and response validation. No native auth/token persistence introduced.
- `tests/buyer-order-history.test.mjs`: focused handler/query-contract and client tests using mocked authentication/query results; one in-process client-to-handler check.

Summary responses exclude address snapshots, payment records and customer profile IDs. Detail responses return saved items and fulfilment/tracking states, capped at 100 of each with a truncation flag. DTO projection strips unselected/extra fields. These are independent reads, not a transactionally consistent snapshot; status changes may require refresh. No new database write, service-role key, RPC, table or dependency was introduced.

Usage after local review: `GET /api/buyer/orders?limit=20`, then the returned `cursor`; detail `GET /api/buyer/orders?orderId=<uuid>`. Shared client: `requestBuyerOrders({baseUrl,...})` or `requestBuyerOrders({baseUrl,orderId,...})`. The endpoint supports persisted orders; an empty history is valid while order creation remains gated. No UI screen/account link was added in this backend batch.

## Validation

**Nine distinct focused tests passed** across the initial eight-test run and an affected-only two-test follow-up (one repeated after a validation simplification). Node heap cap 96 MiB, semi-space cap 4 MiB, no child-test process isolation. Checks cover:

- Authentication before any data query; verified-customer filtering despite supplied customer ID.
- Bounded queries, deterministic pagination and microsecond-preserving cursor/filter injection rejection.
- Ownership-first detail reads, 404 privacy boundary and capped child data.
- Saved totals/prices and fulfilment state preservation; malformed/mixed-currency rows fail closed.
- No private snapshot/raw database error leakage; no-store/nosniff responses.
- Cookie/bearer transport options, malformed/sparse HTTP errors and client-to-handler contract compatibility.

No failures in this batch. Git diff checking passed; index empty; commit `c8b12532dff381dfcac87a14f0013ae013b65eaf` unchanged. No test server was started.

**Not executed:** real Supabase/PostgREST requests, new endpoint browser/native tests, SQL/RLS integration for this endpoint, full Astro/TypeScript/build checks. Mocks verify query construction and response handling, not database permissions or actual sign-in. Existing order/customer RLS and selected fields were inspected in the normalised baseline. Earlier passing results are retained without rerunning.

## Remaining backend gaps

| Area | Remaining gate or gap |
|---|---|
| Buyer | Order-history UI wiring and runtime integration; addresses/cart depend on the reviewed commerce proposals and actual backend readiness. |
| Orders/payments | Quote computes an INR product subtotal. Approved tax/delivery rules, transactional order creation, inventory reservation, payment initiation/webhooks/reconciliation and refund execution remain gated; this batch enables none. |
| Seller | Existing product, business, image, inventory and fulfilment APIs retained. Runtime seller moderation/storage/commerce integration still needs approved validation; do not infer all proposed functions are hosted. |
| Admin | Trusted-admin read-only taxonomy entry point and proposed moderation functions exist. Taxonomy editing, category imagery controls and moderation UI are explicitly not enabled; complete workflow/role validation remains outstanding. |
| Catalogue | Existing browsing/contracts retained. Buyer history reads saved snapshots rather than mutable live catalogue prices. Native basket remains a preview, not a synced paid checkout. |
| Location/services | Existing city/postcode/distance discovery and coordinate-body privacy retained. Real location permissions, provider credentials and operational timezone/resource mapping need acceptance validation. |
| Appointments | Earlier composed operations SQL run passed 17/17. Final slot guards, bounded inventory and worker receipt changes still need the corrected affected-only SQL retry after safe cluster recovery. Original-price cancellation/rescheduling/FIFO logic remains unchanged in this batch. |
| Scheduler/notifications | Worker remains disabled; no cron or external delivery/payment activation. Receipt/backlog SQL, transport/hosting/retry monitoring and audit retention remain gates. |
| Historical data | Unknown holds stay untouched. Approved policy/evidence and resource/hold reconciliation are required before any non-synthetic migration. Legacy and normalised migration chains must not be blindly combined. |
| Mobile | Shared backend contracts preserved. Native execution/full TypeScript retry remains outstanding; Expo/RN version mismatch remains unchanged. No native order-history screen is claimed. |

India-first architecture is unchanged; saved market/currency identifiers are preserved for future multi-market order history rather than converted or assumed to be INR.

## Recommended next batch

After adequate memory/commit headroom is available, perform normal recovery of the preserved D: cluster and only the corrected appointment slot/inventory/worker SQL checks sequentially. Then run focused real-backend order-history ownership/pagination tests with synthetic data and a targeted web/mobile type check before adding UI links. No Windows setting, dependency installation, Supabase access, scheduler activation, commit, push, merge or deployment is authorised by this report.
