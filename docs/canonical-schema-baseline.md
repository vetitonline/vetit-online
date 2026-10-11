# Canonical marketplace schema baseline

The canonical schema-only baseline is [20261009000000_vetit_marketplace_baseline.sql](../supabase/test-project/20261009000000_vetit_marketplace_baseline.sql). This is the same source associated with the baseline already installed on Vetit Online Test; keep one authoritative SQL source instead of copying the 34-table schema into a second migration file.

## Read-only comparison

On 2026-10-10, the authenticated Supabase connection confirmed the target as **Vetit Online Test** (`apfyfmokcynqiaxqvvxx`). The project migration ledger contained four versions: marketplace baseline (`20261008223605`), private business fields (`20261008233606`), seller foundation (`20261009000613`) and seller hardening (`20261009082833`). No write was made.

The remote public schema had 34 tables and the local baseline has 34. A column-name comparison across the 34 tables had no differences. All remote public tables had RLS enabled. The current remote snapshot had 43 policies, 192 constraints and 88 indexes; the baseline itself declares 40 policies, with later approved migrations accounting for the current additions. Remote metadata also confirmed the commerce/service structures (addresses, carts, orders, inventory, fulfilments, appointment slots and bookings) already exist.

This comparison validates the baseline's table and column inventory against Test. It is not PostgreSQL execution of the SQL, a complete semantic diff of every policy/function/index, or evidence about Production.

## Migration handling

The baseline is kept outside `supabase/migrations/` because that directory contains incompatible legacy migrations. Do not copy it into the default directory or run a blanket migration push until a canonical fresh-install chain is validated on disposable PostgreSQL. For an existing environment, migration history and schema must be inspected independently before any additive migration is proposed.
