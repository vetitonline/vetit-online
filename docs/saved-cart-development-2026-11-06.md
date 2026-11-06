# Saved account cart milestone — 6 November 2026

Continues `codex/marketplace-accounts-2026-11-06` from `29752f3100cc8c7a016e0f9d3de59c129e17792f`. The recovered catalogue, seller onboarding/dashboard, account profile and order-history implementations remain in place.

## Customer workflow

- Open a published product with a direct positive INR base price and choose **Save to account cart**. The page loads the current catalogue entry before offering a quantity form. The server rechecks eligibility and current pricing through the existing scoped RPC when saving.
- `/account/cart` reads the signed-in customer's active India cart. Customers can set quantities from 1–99 or remove saved lines. Product titles are rendered as text; hidden/unavailable product details retain a removable saved line.
- Setting a quantity is absolute, not additive. If a base line already exists, its current quantity is shown. The UI does not silently add to or import the browser cart.
- Account, browser-cart and native account screens link to the saved-cart workspace. The native link opens the website without passing tokens; browser sign-in may be required. Native cart editing is a web handoff, not a new native screen.
- The browser cart and its price-review workflow are unchanged. The saved cart has no payable total, stock reservation, order-placement or payment action. Variant-only products cannot be newly added through this page; existing saved option lines retain their variant IDs when quantities change.

## Shared API and session boundary

The existing `/api/buyer/cart` route now delegates to an injectable, tested handler. GET responses add `apiVersion`, `profileId`, `marketCode` and display titles to the existing cart/items structure. Reads remain scoped by the verified user, active cart and requested market; the API retains its existing two-letter market parameter, while this web/client workflow is India/INR only.

POST and DELETE now require `X-Vetit-Profile-Id` to match the authenticated user. Any future consumer of these endpoints must first read the cart and supply that identity; stale account forms receive 409. Existing cookie-origin checks and server-verified bearer authentication remain mandatory. The shared transport uses browser cookies or omits cookies when a bearer token is supplied.

Mutations call only the existing `set_my_cart_item` and `remove_my_cart_item` contracts. No service key, privileged write, direct payment operation, SQL change or migration execution was introduced. The RPC contract remains responsible for owner scope, market eligibility, publication, option validation and current prices.

The workspace coalesces repeated taps and confirms each acknowledged mutation with a fresh same-account read. A failed/unknown write, mismatched readback or account change locks editing until a fresh load; no write is automatically retried. Matching readback confirms current state, not exclusive authorship or an atomic revision guarantee. Session changes and page exit clear private state and invalidate late results. The route participates in private cache/referrer/session handling.

Counted reads reject missing counts, inconsistent row counts, duplicate/invalid lines and carts above 200 lines, rather than exposing an editable partial cart. This is a read boundary, not a transactional cart-size constraint; oversized carts need a separate pagination milestone. Removing lines is always an explicit customer action.

## Validation

Run `pnpm test:saved-cart` for the focused API, transport, workspace and actual page-handler tests. The broader selected run includes account/profile session, buyer input, checkout-quote and order/checkout-page regressions. All tests use synthetic in-process data and make no hosted database requests.

Local commands use the existing writable cache configuration:

```sh
export XDG_DATA_HOME=/workspace/.local/share
export XDG_CACHE_HOME=/workspace/.cache
export ASTRO_TELEMETRY_DISABLED=1
pnpm test:saved-cart
pnpm check
pnpm build
pnpm dev --host 127.0.0.1 --port 4321
```

Current-instance results: **20 focused saved-cart tests and 57 existing regression tests passed**. Astro diagnostics completed with zero errors, zero warnings and 15 informational hints; the SSR build passed. Five local HTTP checks verified saved-cart/account/browser-cart pages, private account cache/referrer headers, the unconfigured API's unavailable response, and cross-origin mutation rejection. These results do not certify hosted persistence or native device execution.

## Remaining launch blockers

Supabase bindings are absent in this instance. Real persistence and cross-account RLS acceptance must be exercised against the approved Test project after its existing reviewed commerce RPC/migration prerequisites are established. An absent RPC returns unavailable; the UI does not fake a successful save or fall back to browser storage. No hosted Auth, database or Storage operation was performed here.

Catalogue option selection, saved-cart pagination, saved-cart price review, atomic order creation, stock reservation, payments/webhooks, shipping/returns and real native device acceptance remain outstanding. Consult the recovered backend sequence and correction handover before approved Test provisioning. Do not replay the legacy foundation migrations or modify the live database as part of startup.

Production, deployment and merging into main remain outside this milestone. Existing environment configuration and secrets were preserved.
