# Customer journey checkpoint — 6 November 2026

Continues `codex/marketplace-accounts-2026-11-06` from `98bff420bf9460fbb46f44be20dd553d4d3da5a0`. Existing accounts, seller onboarding/catalogue, carts, appointments and buyer order history remain in place. No deployment, main merge, live database operation or production credential/configuration change was performed.

## Available implementation

- Product detail pages load eligible, active, currently priced options. The selector shows seller-defined size/colour/other attributes, price and quantity. The public `/api/catalog/[id]/options` contract exposes the same choices to a future native client. Unknown inventory is explicitly unknown; private inventory tables are not queried or exposed. The shared selector and quote calculator reject excess quantities when an authoritative stock count is supplied.
- Browser cart lines are keyed by listing and variant, preserving legacy base lines. Chosen quantity and option labels are saved separately for different options. Saved-account-cart handoff carries the chosen option and quantity. Current price review aggregates case-normalized UUID/variant pairs and re-reads active prices, rejecting stale/missing options rather than substituting a base/minimum price.
- Checkout collects contact/delivery details and reviews either cart source. Details are not persisted in browser storage. Summary, shipping, tax and total are separate; unconfigured charges remain unknown. Shared review transport and API validate identity, quantities, address/PIN/phone, response totals and provider quote expiry. Session changes and page exit clear private form state and suppress late results. Layout uses responsive grids and wrapping controls.
- `checkout-service.js` supplies review and order-creation orchestration plus shipping/tax/sandbox-payment adapter interfaces. Its atomic repository contract requires ownership, current price/stock validation, reservation, quote expiry, snapshot persistence and customer-scoped idempotency in one transaction. Submitted expected totals are consent checks, never price authority. A sandbox payment failure retains the pending order for reconciliation; no path marks an order paid or invokes a live payment adapter.
- **No hosted order repository is installed.** `/api/checkout/orders` remains unavailable with the default runtime dependencies and the UI's order button stays disabled. Creation, replay, mock inventory/concurrency and compatibility with existing buyer order history are tested with an explicitly isolated in-process repository. These tests do not prove PostgreSQL transactions or durable idempotency. No in-memory mock is exposed as a real application backend.
- `/seller/orders` and `/api/seller/orders` show only active businesses associated with `owner`, `admin` or `fulfillment_manager` membership. Customer-wide totals/private address snapshots are excluded. Shipment transitions use the existing scoped `advance_seller_fulfilment` RPC, with identity/origin/ownership preflight, required carrier/tracking for shipping and fresh readback. Missing/unapplied RPCs report unavailable; unknown writes are not retried automatically. Existing buyer history already displays order and shipment status/tracking.
- Returns have an explicit-policy/window and role-checked state machine (`requested → approved/rejected → received → refund_pending`). There is no fabricated return policy, persistent return-request endpoint, automatic refund or active return operation in the UI.

## Verification

All **125 selected tests passed** across the journey, actual browser handlers, saved carts, checkout/order history, native quote/order controllers and auth/session regressions. Run `pnpm test:journey` for the new focused suites. The saved-cart page suite also includes the selected-variant handoff regression.

Astro diagnostics: zero errors, zero warnings, 15 informational hints. `pnpm --dir mobile typecheck` and the SSR build passed. Seven local HTTP checks verified new page rendering, safe unavailable API responses without Supabase configuration and cross-origin order rejection. Hosted persistence, actual device rendering and native binaries were not exercised.

Full dependency audit initially reported seven high findings. Compatible transitive overrides for path-to-regexp 6.3.0, Vite 8.3.3, Zod 4.6.6 and undici 8.12.2 preserve direct dependency pins and existing build permissions. The lockfile was refreshed with verification enabled. Full audit now passes the high threshold with **four moderate and two low advisories remaining**; the production-only audit reported none. Types, regressions and build passed after the overrides. No claim of an advisory-free dependency tree is made.

## Launch blockers

1. Approved Test Supabase configuration and real Auth/RLS/Storage acceptance. This instance has no configured Supabase bindings. Keep the existing Test-only origin restriction and reviewed migration sequence; do not replay legacy foundation SQL.
2. An implemented/reviewed transactional PostgreSQL checkout repository with durable idempotency, atomic inventory reservation, trusted shipping/tax quotes, order/fulfilment snapshots, and concurrency/rollback acceptance. Only adapter orchestration is implemented here; no new SQL was applied or proposed as a validated release.
3. Real shipping and tax adapters and approved rates/policies; live provider onboarding, webhook verification/reconciliation and payment authorization remain disabled.
4. Persisted, participant-scoped returns and refund authorization, customer/seller operational acceptance, larger-catalogue/cart pagination, native device testing, and review of the six remaining lower-severity dependency advisories.

Continue on this feature branch. Publishing a development environment is separate from deploying the application or approving database operations.
