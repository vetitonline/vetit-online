# Fourteen-step offline executor — 23 October 2026

## Scope and execution boundary

`scripts/fourteen-step-executor.mjs` completes the wrapper-aware **offline SQL builder** for frozen `vetit-test-20261021-r1`. It has no database/network/process adapter, hosted connection or apply command. `buildFourteenStep()` returns one explicitly selected step's review SQL. It does not run that SQL. The old draft remains historical; its unresolved wrapper/ledger design is superseded by this module and its tests.

All fourteen payloads and the release manifest are unchanged. The manifest is pinned by SHA-256; every original payload is verified by the existing frozen-package validator. Only the reviewed outer BEGIN/COMMIT are removed from the executable copy; **original, unmodified SQL bytes** remain the single `statements[]` ledger value. Four historical foundation versions/names are preserved, never replayed or manufactured by this executor. Historical foundation statement provenance remains an independent review requirement.

## Atomicity, concurrency and resume

Each step uses its own READ COMMITTED transaction, the existing release advisory lock `(861021,2202)`, an EXCLUSIVE migration-ledger lock, five-second lock timeout and 120-second statement timeout. DDL, exact original-payload ledger entry and recovery receipt commit together. This is **not a whole-release transaction**: completed earlier steps remain committed after later failure. The code does not automatically retry.

Accepted ledger state is exactly the four foundation identities plus a contiguous prefix of the fourteen corrections, with exact names and original payloads. Unknown entries, gaps, altered payloads and out-of-order steps stop execution. Later onboarding/catalogue packages are deliberately rejected by this executor; use their separately reviewed planners after all fourteen steps finish.

The private `vetit_release_executor.steps` table is created inside step one's transaction. It stores step/version, package/payload hashes and the resulting schema checksum. RLS is enabled; PUBLIC, anon, authenticated and service_role receive no schema/table privileges. It is not a public-schema Data API table and needs no anonymous/authenticated grant. No existing application RLS/policies are weakened.

Before resume/replay, the latest committed receipt must match the current managed-schema checksum. The checksum covers schemas, relations, columns/defaults, functions/ACLs/owners/security settings, constraints, indexes, triggers, policies, default privileges and enums in the managed schemas, including Auth/Storage dependencies. It reads catalogs, not protected object bytes or application rows. It is a drift detector, **not proof of semantic correctness, database contents, authenticity or project identity**. Receipt schemas themselves have explicit ownership/RLS/ACL checks. A privileged owner can alter any database evidence; this is not tamper-proof against the database administrator.

Replaying a committed earlier step verifies the current prefix and returns **without rerunning its older DDL**. A stale concurrent caller fails its snapshot gate; it cannot double-apply. Previously applied corrections without these atomic receipts require a separately reviewed adoption plan, not fabricated receipts or a ledger repair shortcut. Deliberate schema changes after a prefix require review; do not edit a receipt to bypass drift detection.

## Required review gates for future Test execution — NOT approved here

1. Independently authenticate exact Test project `apfyfmokcynqiaxqvvxx`, connection and executor role. The builder's project metadata is an attestation, not independent connection verification.
2. Obtain genuine successful Test backup/restore-procedure evidence: successful within 24 hours, inspected within one hour, retention at least 24 hours. Structural metadata validation does not authenticate a backup. Synthetic test metadata never satisfies this gate. Storage object recovery remains separate.
3. Independently inspect the actual baseline functions, grants, RLS, Auth dependencies, prerequisite data counts/conflicts and any unrecorded stronger protections. Approve the exact catalog checksum and prefix from a fresh snapshot within one hour. **Do not merely hash an unreviewed database**: a checksum cannot establish that it is safe to replace existing function definitions. This executor does not reproduce all prior data-prerequisite checks.
4. Review the private receipt objects, original fourteen payloads, execution identity, transaction wrapper, timeout/locking strategy and application maintenance window. Row data is not fingerprinted; concurrent application writes still require the separately approved operational plan.
5. Obtain separate owner approval for any hosted SQL. No hosted executor/connection is included in this milestone.
6. Execute only the next reviewed transaction. On failure, stop; save error and fresh ledger/receipt/schema observations. Confirm full rollback of that step and recheck data prerequisites before explicitly building the next resume attempt. Do not roll back prior security fixes or rewrite migration history. After lost acknowledgement, inspect committed state and use verified replay.
7. After all fourteen steps, independently inspect effective grants/RLS/functions and authenticated acceptance, then review stronger onboarding r2 and catalogue packages in their documented order. Production approvals remain separate.

## Local validation evidence

Focused offline unit tests: `node --test --test-isolation=none tests/fourteen-step-executor.test.mjs`.

Real PostgreSQL scenarios: `tests/fourteen-step-executor.postgres.mjs`, explicitly restricted to a new `vetit_disposable_executor_*` database on `127.0.0.1:55432` as the existing local test role. It refuses existing databases and has no restore/reset/drop path. Auth/Storage shims and ledger provenance are visibly synthetic; no real hosted rows or Storage objects are copied. All original migrations are exercised through the new wrapper, not through separately approximated test SQL.

Evidence directory (local only): `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\fourteen-executor-20261023`.

The first fixture `vetit_disposable_executor_20261022_2045` passed seven groups and stopped at step 13 because its Auth shim lacked `raw_app_meta_data`. It remains preserved; no migration payload was changed to work around the fixture. The corrected fresh fixture and final results are recorded in the consolidated handover and validation receipt. Application code/dependency inputs are unchanged; prior web/mobile tests/builds are reused, not rerun.
