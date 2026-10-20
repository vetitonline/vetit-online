# Vetit Online — consolidated correction plan and local validation
18 October 2026

**Outcome:** two additive SQL corrections prepared; complete dependency-ordered SQL composition passed in a new synthetic local database. **Hosted activation/deployment is not approved or ready.** This report follows the completed 18 October read-only Supabase Test review.

## Five blockers, ordered by dependency

| Order | Blocker | Correction/preparation | Exit condition |
|---|---|---|---|
| 1 | Migration history and release identity | Preserve the four recorded Test entries. A SHA-256 manifest explicitly separates existing foundation from six additive steps and excludes conflicting legacy files and test helpers. A source guard rejects target, ledger or source drift. | Assign new versions in a reviewed isolated release directory; verify fresh Test identity, ledger and catalog before any separately approved application. |
| 2 | Unavailable seller variant function | New full-function replacement uses a schema-qualified object-key count after JSON object type validation. Historical seller migrations remain unchanged. | Focused local valid/invalid/authorization cases passed. Hosted correction still requires approval. |
| 3 | Booking read scope | Independent policy correction permits the customer or active provider owner/admin. Catalogue and fulfilment membership alone grants no booking reads. | Synthetic role matrix passed both before and after lifecycle composition; real hosted Auth/RLS verification remains required. |
| 4 | Missing commerce and appointment objects | Reuse existing reviewed proposal sources in dependency order, without cloning a test database or replaying existing foundation on Test. | Full local composition and object/security assertions passed. Data-dependent hosted preflights and explicit migration approval remain required. |
| 5 | Hosted/product/operational integration | Retain web/mobile smoke, hosted Auth/PostgREST/Storage, resource/timezone and worker-operation gates. No app or deployment changes in this task. | Separate approved test environment and testing/operational decisions; successful integration evidence before release. |

The five blockers combine missing objects into one schema gap and retain integration/operations as a separate deployment gate. The advisor's intentional privileged RPC warnings and deny-by-default tables remain review items, not reasons to add broad grants.

## Exact source and release order
Repository: C:/Users/DELL/vetit-online. Existing uncommitted work was preserved.

For a **new empty local database only**, bootstrap from:
1. Canonical marketplace baseline — recorded Test version 20261008223605.
2. Business-private-fields — recorded Test version 20261008233606.
3. Seller foundation — recorded Test version 20261009000613.
4. Seller hardening — recorded Test version 20261009082833.

Existing Test must retain these entries and objects without replay. Their repository filename timestamps are aliases, not replacement ledger versions.

Then apply this additive order, validated locally:
1. release-corrections/seller-variant-key-count.proposal.sql
2. release-corrections/booking-participant-rls.proposal.sql
3. 20261009100000_vetit_buyer_cart_inventory_fulfilment.sql
4. 20261009110000_vetit_service_booking_transaction.sql
5. appointment-lifecycle.proposal.sql
6. appointment-operations.proposal.sql

These paths are relative to supabase/test-project. The independent RLS correction deliberately precedes new functionality; lifecycle later sets the same ownership predicate.

The manifest records the four exact existing version/name aliases and SHA-256 hashes for all ten SQL sources. The release-source guard consumes a supplied identity/ledger snapshot and rejects mismatches. Its five tests use synthetic snapshots; it did not refresh or validate a hosted ledger during this task.

**Release packaging is prepared, not finalized.** Supabase CLI is unavailable on PATH; no software was installed and no timestamps were invented. New corrections remain unversioned proposals outside the default migration directory. Generate release files using the CLI in a separately reviewed directory later, copy only approved additive sources, and update the manifest with actual versions and hashes. Do not use blanket db push, migration repair, ledger edits, renames or squashing to make the legacy directory appear aligned.

The older initial_marketplace and service_marketplace_foundation migrations remain excluded. Synthetic fixtures, cleanup helpers and test_worker_fault must never enter the release bundle. No Supabase migration ledger was emulated or modified locally; the test exercised SQL source order, while the pure guard exercised recorded-ledger matching. CLI-ledger application remains unverified.

## Code changes
New files only:
- supabase/test-project/release-corrections/seller-variant-key-count.proposal.sql — complete save_seller_product replacement copied from hardening, with only the unsupported count expression changed; transaction boundary and explicit client grants retained.
- supabase/test-project/release-corrections/booking-participant-rls.proposal.sql — standalone transactional ALTER POLICY.
- supabase/test-project/release-corrections/source-manifest.json — foundation aliases, additive order, exclusions and source hashes.
- tests/release-corrections.postgres.mjs — guarded new-database validation using the existing psql runner.
- tests/release-corrections-sql.mjs — hash-verified SQL generation for direct psql execution, using the same synthetic fixtures.
- tests/run-release-corrections.ps1 — direct local-client wrapper, strict new database name, loopback endpoint, refusal to reuse an existing database, no reset/drop.
- tests/release-source-guard.mjs — transport-free identity/ledger/hash validation and focused self-test.
- docs/supabase-test-correction-plan-2026-10-18.md — this report.

No historical migrations, existing proposals, application source, website, mobile files, dependencies or credentials were changed. No commit or push occurred.

### Seller correction
The unsupported call is replaced with:
```sql
(select pg_catalog.count(*)
 from pg_catalog.jsonb_object_keys(item->'option_attributes'))
```
The existing object-type check runs first, and the existing exactly-one-option, normalized SKU, price, membership and atomicity rules remain intact. No compatibility function is added to public. The replacement retains SECURITY DEFINER and an empty search path, revokes PUBLIC/anon execution and grants authenticated execution.

The API signature and return type remain unchanged. Historical SQL still contains the original defect by design; fresh installation must include the new correction after seller hardening. Supabase advisor warnings for intentional authenticated SECURITY DEFINER RPCs will still require contextual review.

[PostgreSQL JSON function reference](https://www.postgresql.org/docs/17/functions-json.html)

## Executed validation
New successful database: **vetit_disposable_corrections_20261018_1302**, existing isolated PostgreSQL 17 cluster on 127.0.0.1:55432. Created new and retained. Synthetic auth/storage compatibility schemas and synthetic users/business/products/booking only.

**11/11 correction groups passed:**
1. Reproduce the unavailable variant function and verify rollback before correction.
2. Save a valid variant with normalized SKU and expected minor-unit price after correction.
3. Reject zero keys, multiple keys, array and null option shapes without persisting products.
4. Preserve base-product saving and authorized catalogue-member variant saving.
5. Deny outsider/suspended members; deny anon function execution.
6. Demonstrate the old broad booking policy admits a catalogue member.
7. After standalone RLS correction, allow customer/owner/admin and deny catalogue/fulfilment/suspended/unrelated users.
8. Preserve that role matrix after all commerce/appointment proposal SQL composes.
9. Verify 35 public tables, 12 private appointment tables, RLS on application tables, 26 public functions, key integrity/uniqueness indexes and absence of test_worker_fault.
10. Verify the variant correction survives composition, private historical reviews reject client reads, worker configuration is disabled, no historical policies are approved and authenticated users cannot execute the worker RPC.
11. Verify the expected 44 public policies remain.

Customer fixture 8 is also an active catalogue member; it still sees its own booking because customer ownership independently authorizes access.

**5/5 release-source guards passed:** matching recorded identity/history/sources; reject wrong target, missing ledger entry, renamed ledger entry and changed SQL.

Also verified: packaged SQL is byte-identical to the executed SQL; JavaScript syntax and PowerShell wrapper parsing pass; git diff --check passed with pre-existing line-ending warnings. Manifest source hashes revalidated successfully.

**Previously passed 18 operations + 4 historical-guard checks were not run.** No previous full build, browser, mobile, concurrency suite or unchanged application tests were repeated. Composition assertions prove installation and selected boundaries, not complete runtime coverage of every commerce/lifecycle RPC.

### Intermediate outcomes, preserved transparently
- Initial Node/psql launch failed with spawn EPERM before database creation. Additional access was not granted; direct psql execution succeeded using already available local authentication. The Node child-process runner remains unexecuted in this sandbox.
- First direct run created vetit_disposable_corrections_20261018_1301 and stopped at a fixture duplicate-profile insert: the baseline auth trigger had already provisioned profiles. Fixture insertion now uses ON CONFLICT DO NOTHING. That partial database remains preserved; no database was reset or deleted.
- Corrected SQL ran in the separate new 1302 database and passed all 11 groups.
- The packaged PowerShell wrapper was syntax-checked; the equivalent direct-client sequence was executed. It was not rerun merely to exercise packaging.

Credentials were used only for local authentication. Passwords and credential-file contents were not displayed, transmitted, uploaded or included in deliverables.

## Remaining risks and concrete approval gates

### Before applying anything to Test
- Approve the exact reviewed additive files, versions and source hashes. Re-read Test identity/ledger/schema and targeted data preflights immediately beforehand; this task made no hosted connections.
- Review migration transactions and lock timing, take an approved recovery/backup approach, and stop on any existing-object or ledger mismatch. Lifecycle is single-application DDL; operations uses IF NOT EXISTS and is not an arbitrary drift reconciler.
- Recheck default-address/base-cart duplicates, provider references, order totals, payment parents, booking references and uniqueness dependencies. The earlier review's zero slots/bookings/orders/payments was time-bound, not permission to assume a permanently empty target.
- Lifecycle adds the resource column and performs overlap preflight in one transaction. If overlaps exist, it aborts and rolls back the column. Approve a separate staged resource mapping approach for that case; never invent mappings or release unknown holds.
- Preserve deny-by-default payment tables and limit privileged function grants. Do not add broad policies to silence informational advisor notices.
- Obtain explicit hosted migration approval. This task grants none.

### After approved Test SQL application, before release
- Verify applied ledger and catalog against finalized manifest; inspect advisor findings.
- Complete real hosted authentication, RLS role isolation, PostgREST function signatures/schema-cache behavior, business column privacy, API exposure configuration and Storage integration. Synthetic shims do not prove these.
- Complete signed-in web customer/provider flow and narrow-screen/accessibility checks.
- Resolve the previously reported Expo/React Native compatibility mismatch and test a supported device in a separately approved task. No mobile edits or device runs occurred here.
- Confirm provider resource identity, timezone/DST and saved-policy behavior. India/INR scope remains; multi-day/recurring capacity and multi-market expansion remain separate.

### Before operational activation
- Approve scheduler host, service-role credential storage, timeout/transport mapping, retry identity, cadence, backlog draining/alerts, audit retention and failure ownership. Worker settings stay disabled.
- Approve historical policy/evidence procedure separately. Unknown holds remain untouched.
- External email/push/SMS, payments, cancellation charges and automatic refunds require their own integration and approvals. A refund intent is not financial execution.
- Production requires a separately authorized read-only preflight and release decision; Test results are not production schema evidence.

A recent Supabase notice schedules removal of old CBC TLS 1.2 suites from project HTTP APIs no earlier than 10 November 2026. Include supported-client compatibility in later device/HTTP testing; it does not affect this direct local PostgreSQL validation. [Supabase changelog](https://supabase.com/changelog)

## Deliverables and boundary
The accompanying correction bundle includes the exact ten SQL sources from the manifest, focused validation scripts and logs. Existing proposal sources are copies for review, not instructions to apply them. The report and bundle contain no credentials.

No Supabase Test or production changes, hosted SQL reads, GitHub operations, deployment, live website edits or mobile app edits occurred. This closes local correction preparation and focused validation; integration and activation approvals remain open.

