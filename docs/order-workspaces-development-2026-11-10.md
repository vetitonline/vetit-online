# Saved-cart review and seller order workspaces — 10 November 2026

Started from clean, pushed `f47b8311fff2ef62c13ef4342f271da37cf7e72f` on `codex/marketplace-accounts-2026-11-06`. Existing seller product, stock, cart, checkout and order mutation services are reused.

## Implemented

- Saved account carts have an explicit current-price review: validated unit prices, line amounts and item subtotal from the existing stock-aware quote API. No stored cart price is trusted. Delivery, tax and final total remain explicitly excluded.
- Review reads the saved cart before and after quoting, requires unchanged account/cart/selected quantities, binds the quote request and response to that account, coalesces taps, and drops late results after edits or account changes. It never saves cart lines or creates an order. Cart edits use the existing confirmed-write controller and invalidate the old subtotal immediately.
- The quote API adds verified `profileId` and advisory `stockState`; expected identity is checked before loading products. The shared transport validates identity when requested. Older quote callers remain compatible. Unknown/partial stock is labelled unconfirmed; known availability is still advisory and never reserves units.
- Seller records are grouped by both order and business, with item subtotals covering only that group's visible lines. Shipments stay beside the matching business's items. Search by product/order and shipment-status filtering use the same complete server-scoped snapshot. Unsaved shipment details require confirmation before filtering/reloading.
- Shipment actions reuse the existing role-scoped API, account binding, confirmation and fresh status readback. Projection validates bounded records, identities, duplicates, currencies and arithmetic; it omits unrelated fields. Shared JS contracts are usable by future mobile adapters.

## Validation

243 application checks passed, including nine new controller/projection/API checks and existing seller/account/cart/checkout/order/native regressions. After the stock-state addition, 54 focused quote/native/customer checks passed again. Astro diagnostics reported zero errors/warnings (17 hints); mobile TypeScript and SSR build passed.

Installed Chromium passed a desktop/mobile flow using actual pages/modules with synthetic API/auth fixtures: price review, edit invalidation, insufficient-stock rejection, account clearing, business-separated grouping, status filtering, declined dirty-form discard, and one confirmed shipment update/readback. No order-placement request occurred; external browser requests were blocked. This is not hosted Supabase/payment acceptance. Use `pnpm test:order-workspaces`, or with local Astro on port 4321, `pnpm test:order-workspaces-browser`.

No SQL changed; previously tested PostgreSQL proposals were not rerun or applied. No dependencies, lockfiles, credentials or environment settings changed.

## Limits and launch prerequisites

Price review supports at most 50 selections, matching checkout's existing limit, and explicitly refuses larger saved carts rather than truncating them. Seller reads retain the existing 200-record bounds; larger accounts require pagination. A shipment without visible lines has an unknown subtotal, never fabricated zero. Dispatch authority/payment eligibility remains enforced by the existing database transaction; this UI does not enable payments or bypass pending-order restrictions.

Hosted order creation stays disabled. Existing backend proposals remain unapplied; approved Test Auth/PostgREST/RLS/Storage acceptance, trusted quote/repository wiring, shipping/tax services, payment verification/reconciliation, reservation expiry, operational rate limits and native device validation remain launch requirements. Previously documented dependency advisories still require compatible upstream/tooling upgrades.

No hosted Supabase access/change, deployment, merge, reset, deletion of existing work or force-push occurred.
