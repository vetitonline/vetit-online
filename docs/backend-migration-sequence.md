# Backend migration sequence and current boundaries

This note describes the known Vetit Online Test database state as of 2026-10-10. It is not an instruction to execute migrations.

## Canonical schema baseline

The existing file `supabase/test-project/20261009000000_vetit_marketplace_baseline.sql` is the canonical schema-only baseline; it is not duplicated into the default migration directory. A read-only comparison against the current Test project found 34 public tables in both and no table-column differences. All 34 current public tables have RLS enabled. The baseline declares 40 policies; the current project has 43 after the later privacy and seller migrations. The current Test snapshot reports 192 constraints and 88 indexes.

The baseline already contains buyer addresses, carts, orders, seller inventory, service listings, appointment slots and bookings. Those tables must not be recreated. The payment booking foreign key is named `payments_booking_id_fkey`; generated TypeScript relationships must use the actual constraint names and composite columns from the baseline.

## Verified Test history

The separate `Vetit Online Test` project (`apfyfmokcynqiaxqvvxx`) reports these applied migrations, in order:

| Test ledger version/name | Repository SQL source |
| --- | --- |
| `20261008223605` — `vetit_marketplace_baseline_20261009000000` | `supabase/test-project/20261009000000_vetit_marketplace_baseline.sql` |
| `20261008233606` — `vetit_business_private_fields` | `supabase/test-project/20261009010000_business_private_fields.sql` |
| `20261009000613` — `vetit_seller_backend_foundation` | `supabase/migrations/20261008092024_vetit_seller_backend_foundation.sql` |
| `20261009082833` — `vetit_seller_security_hardening` | `supabase/migrations/20261008210707_vetit_seller_security_hardening.sql` |

The current Test tables are empty. No migration was applied during this development task.

## Local proposals

The files under `supabase/test-project/` are explicit review proposals and are not in the standard Supabase migration directory. This prevents a normal migration push from silently including the legacy files in `supabase/migrations/`.

1. `20261009100000_vetit_buyer_cart_inventory_fulfilment.sql` — address/cart RPCs, seller inventory and fulfilment operations, event history and order integrity checks.
2. `20261009110000_vetit_service_booking_transaction.sql` — atomic booking of one pre-generated appointment slot at the server-resolved current service price.

The read-only `GET /api/services/slots` route uses the already-applied public slot schema/RLS and does not depend on these proposals. Address/cart writes, inventory updates, fulfilment transitions and appointment booking RPC calls remain unavailable until their corresponding proposal is separately approved and applied; they fail closed with the Supabase RPC error path.

Before applying either proposal, reconcile the version/name history recorded by Supabase with repository migration history and validate both SQL files in disposable PostgreSQL. The commerce proposal must precede the service booking proposal for the intended integration test plan, although the current booking proposal uses only baseline service objects.

## Legacy migration compatibility

Do not use a blanket `supabase db push` or replay the historical root migrations against the current Test baseline. In particular, `supabase/migrations/20261004000000_initial_marketplace.sql` and `supabase/migrations/20261005000000_service_marketplace_foundation.sql` describe the older ownership/service model and conflict with the normalized Test schema and its applied history. The seller foundation and hardening source files also have local timestamps that differ from the versions recorded by Test; they must not be replayed.

A fresh-database bootstrap is not yet reconciled. It requires a reviewed canonical migration chain derived from the current baseline and verified seller migrations, not edits or destructive replacement of historical files.

## Reconciliation strategy

- **Fresh installation:** the ordered schema sources are the canonical baseline, business-private-fields, seller foundation and seller hardening files in the mapping above. The current repository does not yet have a safe default CLI chain: the baseline/privacy files are outside `supabase/migrations/`, while that standard directory contains conflicting legacy files and the seller source timestamps differ from Test's recorded versions. Keep fresh bootstrap blocked until a separately reviewed, standard-directory chain and version map pass disposable PostgreSQL validation. Do not run `supabase db push` against this repository as-is.
- **Existing Vetit Online Test:** preserve its four recorded versions. Apply only separately reviewed additive migrations after confirming exact project identity and absent migration state; never replay the baseline or seller migrations.
- **Production:** do not infer its schema or history from Test. Require a separate read-only production preflight and compare its migration ledger/schema before proposing any action. No production operation is authorised by this document.

### Safe source reconciliation (no history rewriting)

The following mapping is a source/release plan, not a command to replay anything. Keep the historical files and the Test migration ledger unchanged:

| Install target | Source order | Required handling |
| --- | --- | --- |
| Fresh disposable database | marketplace baseline → private-business-fields → seller foundation → seller hardening | Build a separately reviewed standard migration chain and explicit version aliases from the mapping above. Do not copy the baseline into the legacy chain until disposable PostgreSQL proves the complete ordered chain. |
| Existing Test | the four versions in the verified Test ledger | No replay. The commerce and appointment SQL remain separate additive proposals, each requiring independent review and approval. |
| Production | unknown until independently inspected | No inference from Test. Read-only schema/ledger preflight and a separate approved migration plan are prerequisites. |

Do not rename, edit, squash, or mark historical migrations as applied to make these paths appear aligned. A future fresh-install bundle should be generated as a new, reviewed release artifact from the canonical sources, with a tested source-to-ledger map; it must not replace either environment's history. The two proposals below are not part of that bundle until their SQL is validated on a disposable PostgreSQL instance.

## Functionality intentionally not enabled

- Order creation and inventory reservation at checkout are not implemented. Delivery fees and tax calculation have no approved, versioned rules/configuration. The API remains quote-only and does not accept client totals.
- Payment capture/provider callbacks are not enabled; payment status remains server/provider controlled.
- Appointment slot requests are proposed, but cancellation, provider confirmation/rejection and rescheduling workflows remain unimplemented.
- Inventory levels are variant-based in the verified schema; unvaried listings have no stock row model yet.
- SQL execution, RLS/concurrency tests and migration application have not been performed in this task.
- India GST treatment/rates, delivery zones and charges, payment-provider choice, refund rules, reservation expiry and checkout idempotency ownership are commercial decisions, not values to infer in application code. See [India commerce policy proposal](india-commerce-policy-proposal.md).
