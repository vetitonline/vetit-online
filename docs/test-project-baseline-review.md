# Vetit Online Test project baseline review

Status: prepared for review only. No SQL or migrations have been run against either Supabase project, and no database records have been written.

## Test project inspection

The read-only inspection targeted only Supabase project `apfyfmokcynqiaxqvvxx` (Vetit Online Test). It is active and healthy, with no application tables in `public`, no public/storage RLS policies, no application functions, no application migration history, and no Storage buckets. Supabase's internal Storage migration metadata exists; it is not Vetit application migration history. No customer or marketplace rows were found. Production was not queried for this task.

## Proposed SQL files and execution order

These files are deliberately outside `supabase/migrations`, so the normal production migration chain cannot pick them up automatically:

1. [`supabase/test-project/20261009000000_vetit_marketplace_baseline.sql`](../supabase/test-project/20261009000000_vetit_marketplace_baseline.sql) — schema-only, 34 typed application tables, foreign keys, checks, indexes, RLS, explicit table grants, administrator-only taxonomy policies, and profile creation trigger. It does not create Storage buckets or insert data.
2. [`supabase/migrations/20261008092024_vetit_seller_backend_foundation.sql`](../supabase/migrations/20261008092024_vetit_seller_backend_foundation.sql) — first seller RPC and moderation draft. This is superseded in key areas by step 3 and must not be treated as a final standalone seller implementation.
3. [`supabase/migrations/20261008210707_vetit_seller_security_hardening.sql`](../supabase/migrations/20261008210707_vetit_seller_security_hardening.sql) — hardened RPC implementations, direct-write restrictions, active-business and ownership checks, moderation, image reservations, and private Storage bucket/policies. Apply after step 2 because it replaces its functions and tightens its grants/policies. It rejects incompatible existing bucket settings rather than silently changing them.
4. [`supabase/test-project/marketplace-fixtures.sql`](../supabase/test-project/marketplace-fixtures.sql) — explicit test-only India/INR market, 3 species, 4 product categories, and 3 category/species links. This is the only proposed SQL file with data inserts. It does not create Auth users, businesses, products, prices, images, or customer records.

The legacy [`supabase/migrations/20261004000000_initial_marketplace.sql`](../supabase/migrations/20261004000000_initial_marketplace.sql) and [`supabase/migrations/20261005000000_service_marketplace_foundation.sql`](../supabase/migrations/20261005000000_service_marketplace_foundation.sql) are not part of this sequence. They define the older `businesses.owner_id/kind`, `listings.category/status/price_paise`, and separate product/service category model. Applying them to this fresh project conflicts conceptually and structurally with the current normalized application model. The baseline provides the current unified category and service tables instead.

## Model and security review

The baseline defines the 34 tables found in the current generated Supabase TypeScript model, including profiles, taxonomy/species, markets, businesses/memberships, listings, variants/prices/images, provider/service discovery, booking, buyer cart/order/fulfilment, inventory, payment references, and reviews. Prices use integer minor units with separate market and currency fields; India starts as `IN`/`INR`. Variant ownership uses composite foreign keys. Currency and country identifiers are constrained. Catalogue and customer data tables have RLS enabled; grants are explicitly revoked before narrowly scoped grants are added. Sensitive payments, payment-account and inventory tables expose no client table grants.

Taxonomy mutation policies require the trusted `app_metadata.vetit_admin = true` claim. User-editable metadata and profile roles do not confer administrator access. Public users can read active taxonomy and qualifying published catalogue rows. Seller table writes are held for the hardened RPC flow; child image DML is granted only by the seller migrations.

The baseline includes a narrowly scoped security-definer membership helper for the listing-market policy path, preventing RLS from recursively re-entering listings through listing-market visibility checks. Public price and image metadata reads are gated on effective market availability plus an active, verified seller and published listing; private seller reads remain membership-scoped. The seller hardening trigger uses a distinct local variable name for its business ID to avoid PL/pgSQL variable/column ambiguity. These SQL paths still require execution in the isolated test project before they can be considered runtime-validated.

## Test fixtures and Auth setup

The fixture IDs are deterministic and visibly reserved under the `90000000-0000-4000-8000-0000000000xx` range. They define Dogs, Cats, and Cattle species; Pet Food & Treats, Dog Food, Cat Food, and Livestock Feed categories; three species links; and the active India/INR market. The SQL uses insert-if-absent plus integrity checks that stop on incompatible fixture rows. It is designed for the inspected empty test project; if the project changes before approval, inspect the relevant rows again first.

Two seller test accounts and one administrator account must be created in the Test project's Auth system after approval. Use dedicated test-only email identities. Set the administrator claim only through trusted Auth Admin controls (`app_metadata.vetit_admin=true`), never through client-editable `user_metadata` or a profile role. Retrieve short-lived JWTs locally; do not paste credentials or tokens into chat. The seller integration test requires the project URL/anon key and seller A, seller B, and administrator JWTs plus fixture category/species IDs. Its cloud-write guard additionally requires `VETIT_SELLER_INTEGRATION=1` and `VETIT_ALLOW_CLOUD_TEST_WRITES=I_UNDERSTAND_TEST_PROJECT_WRITES`, and hard-codes the Test project ref allowlist.

The integration test creates businesses, draft listings, image reservations/uploads, and one published listing. It currently cleans up extra image reservations, but does not remove all test-created records. Use a dedicated disposable Test project, record each run's generated IDs, and reset/recreate only that test project after review if cleanup is needed. Do not run it against production.

## Migration and recovery considerations

- Use a dedicated Test project and apply one file at a time in the listed order. Capture each result and inspect table/function/policy state between steps.
- The baseline uses `CREATE TABLE` and is intended for an empty application schema, not as an in-place production reconciliation. It is not fully rerunnable: table definitions are intentionally not `IF NOT EXISTS` because silently accepting drift could leave insecure or incompatible structures. Do not rerun it over a partial schema; recover by inspecting the disposable Test project and rebuilding it through an explicitly approved test-project reset/recreation procedure.
- Some future order/service cross-record relationships (for example, matching a fulfilment's business to each fulfilment item, or matching a booking's provider to the service listing) are ordinary foreign keys but are not all composite ownership constraints in this baseline. No client write grants currently expose those workflows; trusted checkout/booking APIs must validate the cross-record ownership before writes are enabled, or a separately reviewed constraint/type update should be added first.
- Seller migrations use replacement/drop-create patterns for their owned functions, triggers, and policies. They are only conditionally rerunnable; a failure mid-file must be inspected before reapplication. The hardening migration intentionally fails on an existing `listing-images` bucket with incompatible settings.
- Recovery should use a fresh isolated Test project when baseline installation is partial. Do not delete or reset production data. No rollback SQL is proposed because dropping these objects is destructive; any cleanup/reset requires separate explicit approval and must target the Test project only.
- Before applying, review the final SQL, trusted admin claim provisioning, private Storage policy behavior, and fixture IDs. Approval is required before any write to the Test project.

## Static validation and limitations

Static checks can compare declared table names/columns with `database.types.ts`, inspect references/grants/policies, run JavaScript syntax checks, and run the seller validation test suite. PostgreSQL parsing, migration execution, RLS behavior, Storage access, and concurrency require an isolated PostgreSQL/Supabase runtime. Docker/Podman, Supabase CLI, `psql`, and local PostgreSQL server tools are unavailable in this environment; therefore no database integration tests can be executed locally. The official [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows) documents the CLI/Docker-compatible runtime requirement.
