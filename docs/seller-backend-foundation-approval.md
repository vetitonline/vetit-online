# Seller backend security review — approval required

This is a local-only review of the seller migrations and application changes. No SQL was executed against live Supabase, no live data or settings were changed, and no commit, push, or deployment was made.

## Migration order

The seller foundation and its hardening migration must be reviewed and applied together, in this order:

1. `supabase/migrations/20261008092024_vetit_seller_backend_foundation.sql`
2. `supabase/migrations/20261008210707_vetit_seller_security_hardening.sql`

Do not expose or deploy the seller application between these migrations. The second migration replaces the first draft's onboarding, product-save, and submission RPC implementations and closes direct Data API writes. Its own functions, grants, triggers, policies, and bucket check are rerunnable. It only drops/recreates policies and triggers named by Vetit. It does not drop or alter any existing catalogue row, table, or unrelated policy.

## Security and behavior changes

- Seller onboarding is authenticated and idempotent: it creates the `profiles` row for `auth.uid()` with `ON CONFLICT DO NOTHING`, then locks that row to serialize retries and returns the existing active owner seller business. It never accepts profile identity or role from request input. It intentionally reuses one owner seller business per account; multiple stores per owner would need a future explicit idempotency-key design.
- Product saving validates JSONB type before array operations, item fields, normalized unique SKUs, active product categories, unique active species and category relationships, India market currency, and INR amounts. Variant and base prices are stored in minor units.
- Submission is locked to product listings, active seller membership/businesses, active categories/species, pending India compliance, and exactly one currently effective INR price for the base product or each active variant.
- Direct Data API insert/update/delete is revoked for listings and their pricing/market/species/variant rows. Sellers submit through the scoped RPC; trusted administrators use `app_metadata.vetit_admin`-checked business/listing review RPCs.
- Parent business, membership, listing and child rows are locked in a consistent order. Child rows cannot be reassigned across listings; content writes and submission/moderation serialize on the listing row. Published rows and their child records are seller-immutable.
- A rejected listing save resets India compliance to `pending`; submission requires that renewed review state. Admin publication rechecks business verification, product-only kind, active category/species, current prices, and completed image reservations.
- Seller photos use server-generated `business/listing/UUID.extension` paths. A database reservation is created before Storage upload; a trigger serializes the five-photo cap. Storage permits authenticated uploads only for the owner business/listing reservation and permits anonymous reads only for visible photos on published products from verified active businesses. Restrictive Storage boundary policies prevent unrelated permissive policies from widening access to the private listing-images bucket; other buckets keep their existing policy behavior.
- Existing business-membership read RLS and other marketplace read policies are not replaced. Column grants allow sellers to edit only public business profile fields; moderation fields require the admin RPC.

## Verification plan

- `tests/seller-validation.test.mjs` covers client/server input validation and ownership helpers.
- `tests/seller-backend.integration.test.mjs` covers concurrent idempotent onboarding/profile initialization, malformed variants, cross-business writes and image access, reservation caps under concurrent inserts, direct Data API bypass attempts, submit/save races, trusted admin checks, and anonymous Storage access before/after publication.
- The integration suite is deliberately gated to a localhost Supabase project and dedicated seller/admin JWT fixtures. It must not be pointed at production. It requires applying both migrations to an isolated project based on the actual marketplace schema and seeding an active product category/species plus a trusted test admin JWT. A service-listing fixture can be supplied to cover product-only submission.

## Approval and remaining risks

Explicit approval is required before applying either migration to any database. Before approval, reconcile the migration history with the live project: the repository's older initial marketplace migration does not describe the current production schema, and migrations must not be blanket-pushed. Confirm the two files against a disposable schema snapshot first and verify existing role grants/RLS policy names there.

Storage restricts bucket metadata MIME types and size; it does not inspect image bytes for spoofed MIME headers. A future image-processing service should decode/re-encode uploads before they are made public. The auth admin claim is read from trusted `app_metadata.vetit_admin`; provisioning that claim remains outside this migration and must stay server-controlled.
