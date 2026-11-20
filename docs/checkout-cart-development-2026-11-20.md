# Cart-to-checkout consistency — 20 November 2026

## Preserved Git checkpoint

The checkout was clean on `codex/marketplace-accounts-2026-11-06` at local lifecycle commit `e8b13fe`. GitHub was at `a2d5381d14c9d586a0f601677cbea94b60ec2ab3` with three browser-cart/CI commits after `4520673`. An explicit pull with a normal feature-branch merge produced `9c39e17`, preserving both histories without rebase/reset/force-push. Both `a2d5381d` and `e8b13fe` are ancestors of this milestone. Main was not involved. Existing Supabase settings, credentials, lockfiles and SQL proposals were preserved.

## Implemented

- Both checkout price review and delivery/order-summary review read the selected cart source. The price pane previously always read browser storage even on saved-account checkout.
- A shared checkout cart reader uses the existing saved-cart client/schema and quote-line normalization. It canonicalizes UUID/variant pairs, aggregates quantities, preserves variant identity and enforces existing quantity/selection limits. Stored prices, seller claims and payment flags never become checkout authority.
- Cart selections are read again after server price/stock review and before displaying its result. Same-tab browser writes and remote saved-cart edits are detected even without a browser storage event. Equivalent ordering/casing changes do not falsely invalidate a basket. Empty or blocked storage is never treated as a successful fallback cart.
- Changed cart contents invalidate summaries while retaining typed delivery details. Changed account identity (including a switch to an empty cart) clears private customer/address context. Source changes, resets, field changes, account events and page exit invalidate old results.
- Unavailable browser storage gives an actionable message; the user may explicitly select a saved account cart. Unauthorized saved-cart reads expose a sign-in link preserving the checkout return URL.
- The existing feature-branch cart CI workflow now also runs dependency-free checkout selection tests. No new order/payment endpoint or write operation was added.

## Validation

- Before implementation: all four browser-cart regressions passed, including the new 99-unit limit and unavailable-storage tests from GitHub. Another 71 relevant saved-cart/journey/checkout checks passed.
- Final selected regression run: **135 tests passed**, covering browser cart, checkout snapshots, saved cart, customer journey/forms, quote/stock/UUID validation, native checkout, transactional adapters and preserved sandbox lifecycle behavior. New tests cover stale browser/account carts, invalid storage, account switches, variant aggregation, limits and delivery-detail preservation.
- **Three isolated Chromium desktop/mobile flows passed**: the new selected-cart/current-price/stock/staleness/storage scenario; saved-address CRUD and checkout reuse; saved-cart review and seller-order update regression. Tests use synthetic identity/API fixtures and the actual page/client scripts; the new delivery test uses the real checkout handler with fixture products. External browser requests are blocked, no order-placement request occurs, and payment controls stay disabled.
- Astro diagnostics: zero errors/warnings. Mobile TypeScript and SSR build passed. No dependencies were installed or upgraded. SQL was unchanged, so the existing isolated PostgreSQL suite was not unnecessarily repeated.

Focused commands: `pnpm test:checkout-cart`; with local Astro on `127.0.0.1:4321`, `pnpm test:checkout-cart-browser`. The GitHub cart workflow runs `node --test tests/journey-browser-cart.test.mjs tests/checkout-cart.test.mjs` without installing app dependencies.

## Remaining launch blockers

These are informational, read-only reviews. They do not reserve stock or establish a final order/payment commitment; the atomic backend must revalidate at order creation. Hosted order creation remains disabled. Existing backend proposals, including the preserved lifecycle proposal, remain unapplied. Real shipping/tax/payment provider adapters and rates, approved reservation policy and scheduled reconciliation/expiry wiring, manual payment-review/refund operations, distributed rate limiting and hosted Auth/PostgREST/RLS/Storage acceptance remain launch prerequisites. Previously documented dependency advisories still need compatible upstream upgrades. No real payment activation, hosted database access/change, production deployment or main merge occurred.
