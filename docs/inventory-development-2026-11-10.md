# Seller inventory and customer availability checkpoint — 10 November 2026

Continues `codex/marketplace-accounts-2026-11-06` from `beaa88bf480df8a077a896b504e36b0c092c8031`. Existing account/address, seller onboarding/catalogue, cart and transactional-order implementations are reused.

## Implemented

- `/seller/inventory`: responsive default-location variant inventory, business/title/SKU filtering, on-hand/reserved/available counts, missing-stock initialization, explicit save confirmation and verified readback. Dashboard and mobile web handoff links are included. Account changes clear private data; uncertain writes require reload without automatic retries.
- Versioned `/api/seller/stock` GET/POST and shared browser-cookie/native-bearer contracts. Active owner/admin/fulfillment roles manage only their businesses. Catalogue-only membership does not grant stock management. Existing `/api/seller/inventory` and non-default-location API behavior are preserved.
- Additive **unapplied** `supabase/test-project/20261110090000_seller_inventory.proposal.sql`: scoped read RPC, optimistic checked adjustment around the existing reservation-aware stock writer, and filtered public purchase-limit RPC. Concurrent stale changes fail rather than overwrite another update. Private inventory tables receive no new grants.
- Public product options expose only a capped purchase limit (0–99), not seller on-hand/reservation/warehouse details. Product selection, browser-cart additions, saved-cart handoff and checkout review use existing selection/quote validation against it. Checkout returns an actionable stable stock-conflict code. Missing inventory remains explicitly unknown; an absent proposal RPC retains legacy unknown-stock behavior. Other RPC errors fail closed. These hints never replace atomic order-time reservation.
- English default with a shared copy dictionary and reviewed-language fallback for future translations. The shared stock HTTP API accepts native bearer authentication; a native inventory editor is not included.

## Validation

- 205 distinct application checks across targeted account/address, seller catalogue/images/drafts, stock API/controller/security/transport, customer selection/cart, checkout/repository, orders and native regressions. The final checkout-focused rerun passed 37 checks after adding the stock-conflict response.
- 24 scenarios in disposable PostgreSQL 17 with the canonical baseline and seller/commerce/checkout/inventory proposals: existing atomic order races/rollback/authorization plus stock role scoping, stale concurrent edits, reservation minimum, stock-reduction vs checkout race, concurrent initial stock creation, and public visibility/capping. Runner uses a pinned image, no external networking, no host ports and no hosted database URL. Supabase Auth functions are local compatibility fixtures; this does not verify hosted JWT/PostgREST wiring.
- Isolated Chromium desktop/mobile flow with synthetic identity/API fixtures: seller stock change/readback, English fallback, viewport fit, account isolation, excessive saved-cart quantity rejection, corrected cart and successful checkout review. External browser traffic is blocked. Run with local Astro on `127.0.0.1:4321` and `pnpm test:inventory-browser`.
- `pnpm test:inventory`, Astro diagnostics, mobile TypeScript and production SSR build. No dependencies or credentials changed.

## Remaining launch prerequisites

The new SQL is a review proposal outside automatic migrations and has not been applied to Supabase. Obtain explicit approval for the Test migration sequence and deployment; do not run a blanket database push. Real Supabase Auth/PostgREST/RLS acceptance remains outstanding. Hosted order creation stays disabled; runtime quote/repository bindings, shipping/tax services, payment verification/reconciliation, reservation-expiry policy and operational rate limiting remain launch prerequisites. Base-product inventory and multi-warehouse allocation are outside this default-location variant milestone. Public availability can change immediately and never guarantees a reservation.

No production settings, live database, main merge, deployment or force-push is part of this checkpoint.
