# Delivery address book and checkout reuse

Continues `codex/marketplace-accounts-2026-11-06` from `b50130225e5d2422776a3f34e38b7b89d9f74485`.

## Customer flow

- `/account/addresses` supports creating, editing, making default and explicitly removing owned addresses. Account and native web-handoff navigation link to it. Dirty drafts require an explicit discard before switching edits; uncertain writes remain locked until a fresh read.
- `/checkout` loads the same saved addresses on demand. Choosing **Use this address** copies validated delivery fields without storing personal details in browser storage. Loading never overwrites a manually entered address automatically. Incomplete/foreign addresses remain repairable in the address book but cannot silently pass the India checkout validator.
- A saved cart links directly to `/checkout?source=account`, retaining selected variants and quantities. Contact email remains a checkout field. Shipping/tax charges remain server-calculated or unknown; this milestone does not enable order placement or payments.
- Account changes, expired identity and stale-account responses clear private form/list state and invalidate pending results. Checkout binds copied addresses and saved carts to their loaded profile ID; a mismatch is rejected before downstream catalogue/shipping work.
- Mobile testing found the header could widen the layout beyond the device viewport. Scoped wrapping rules now keep the new pages within 390 pixels, including account status text.

## API and database

The existing `/api/buyer/addresses` endpoint delegates to a tested handler. GET adds `apiVersion: 1` and `profileId`, retains snake-case address fields, applies explicit ownership filters, private/no-store headers and complete counted reads (100-address read boundary). Larger/incomplete results fail closed rather than exposing an editable partial book.

POST/DELETE require the loaded `X-Vetit-Profile-Id`, the existing cookie-origin or verified bearer authentication boundary, and user-scoped queries/RLS. POST passes only allowlisted fields to the existing `save_my_address` RPC. Updates verify ownership before invoking the RPC; deletion is scoped by both address ID and authenticated profile. No service key is used. Browser cookies and native bearer clients share `requestAddressBook` and the same normalized contract.

The workspace coalesces saves and verifies acknowledgements through fresh owned reads. It never automatically retries an uncertain write or treats a pre-existing ID as a confirmed new address. The checkout delivery validator is shared between saved-address selection and server review, preserving the existing stock-backed order request contract.

**No migration, database schema, environment configuration, credentials or hosted checkout gate changed.** Existing migrations and the default-disabled atomic checkout remain intact. Saved-address deletion here does not change delivery snapshots already copied into placed orders.

## Evidence

- **167 selected application/adapter tests passed**, covering address ownership/defaults, malformed input, cookie/bearer transport, readback reconciliation, stale sessions, address reuse and existing account/cart/catalogue/checkout/order flows.
- **19 real PostgreSQL scenarios passed** in the existing disposable, network-isolated Docker harness. The added address scenario verifies actual RLS, default-address rollback after a foreign update attempt, owned deletion and preservation of existing order snapshots. No hosted database was contacted.
- **Desktop/mobile Chromium workflow passed**: create/edit/default/remove, private draft clearing on account switch, saved variant cart plus address checkout review, and a 390-pixel layout without browser auto-scaling. Identity and API requests use synthetic in-process fixtures; this is not hosted Auth/PostgREST acceptance. External browser requests are blocked.
- Astro: zero errors, zero warnings, 16 informational hints. Mobile TypeScript and SSR build passed.

Run `pnpm test:addresses` for focused contracts/security tests. With the development server at `127.0.0.1:4321` and installed Chromium, run `pnpm test:addresses-browser`. The existing `pnpm test:checkout-db` runs the isolated database scenarios.

## Remaining launch prerequisites

Supabase bindings and approved Test migration/application acceptance remain required for hosted persistence and real OTP sessions. The address book reuses the already-proposed commerce RPC; a missing RPC reports unavailable, with no fake save or browser-storage fallback. Authoritative shipping/tax services, quote/payment workers, reservation-expiry policy and explicit deployment approval are still required before hosted orders can be enabled. Native clients have a shared API and web handoff, not a new native address-editor screen. Address-book pagination above 100 rows is a future extension.
