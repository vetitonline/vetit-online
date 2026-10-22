# Security-preserving onboarding package r2 — not hosted-ready

This supersedes **unapplied** r1. Forward version **20261022091620** and separately approved pause version **20261022091621** were generated locally with the existing verified Supabase CLI v2.121.0, isolated home and empty token. No login/link/hosted SQL/deployment occurred. The manifest pins both payloads; SQL/JSON Git attributes preserve their bytes. No existing package/archives were deleted. r1's historical SQL bytes remain evidence, but its weak reversal is prohibited and its generator/SQL runner now fail immediately.

## Stronger security remains in place

Forward SQL has exactly the same four business/profile function bodies as the prior locally tested package, with its baseline/ACL/RLS/moderation/data preflight guards. Current restricted owner relationships block replacement registration; ambiguous ownership requires review. Profile provisioning, row locks, direct-input validation and created/reused results remain. The strict recovery policy still needs owner acceptance; no history/ban enforcement is inferred when ownership records have been deleted or roles changed.

Recovery **pauses onboarding**: revoke client execution of both legacy/v2 RPCs while retaining their stronger definitions, private helpers, input validation trigger, both moderation guards, RLS and all rows. It does not restore the legacy body, drop objects, loosen table grants or re-enable registrations. Pause is not automatically included in forward migrations; it is under `recovery-review/` and needs separate exact approval. Unpausing requires a new reviewed forward action after diagnosis; no automatic grant/legacy rollback is supplied. The previously proposed weaker reversal must never run, including in current local tests.

There are no new public tables, broad grants or default-ACL changes. Public RPC execution is explicitly authenticated-only after apply and denied to clients after pause. Private helpers remain inaccessible, definer search paths remain empty, and existing RLS/column boundaries are retained. Upcoming Data API table-grant changes do not justify granting access to more tables or anonymous users.

## Atomic ledger review builder

`scripts/onboarding-atomic-plan.mjs` has **no network/database/subprocess execution path**. Its CLI reports blockers, not SQL to run. The exported review builder requires a project-matching backup evidence record, a successful backup within 24 hours, inspection within one hour, retention of at least 24 hours, evidence/restore references and an explicitly reviewed executor role. These are conservative proposed operational gates, not proof of authentication or a replacement for owner approval. Synthetic test records are never real backup evidence.

For a reviewed package, the builder produces a separately reviewed representation: remove only its one outer BEGIN/COMMIT pair, execute the pinned DDL inside a new transaction, verify resulting definitions/owner/search paths/RLS/guards/ACLs, and insert the **exact original payload and name** into `supabase_migrations.schema_migrations` before the same COMMIT. Raw payload text in the ledger is data, not executed transaction wrappers. One advisory transaction lock serializes these apply/pause actions; proposed lock/statement timeouts are 5s/120s.

An exact existing version/name/payload plus matching schema/ACL state is a verified no-op. Unknown/partial predecessor version sets, payload changes, missing guards or changed security state stop; they do not lead to retries, ledger repairs or overwrites. Apply after a recorded pause fails rather than reopening access. Post-commit connection loss requires a fresh ledger/schema comparison, not replay from memory. Pause schema and its ledger entry also commit together.

**Limits:** this design covers these two new actions only. It does not solve execution/ledger atomicity across the frozen fourteen files with existing transaction wrappers. The planned predecessor chain remains four foundation entries plus those fourteen versions, excluding unapplied r1. Their names/content/provenance and actual schema must still be independently verified. This builder checks predecessor versions and the required schema baseline; it does not certify all predecessor content. A future live executor must additionally bind the connection to exact Test project `apfyfmokcynqiaxqvvxx`, use trusted owner credentials privately, verify prerequisite evidence, and obtain explicit execution approval. No live executor is provided and `executionReady=false` remains mandatory.

## Actual local evidence

Three focused Node tests passed: missing/stale/wrong-project/incomplete backup rejection; atomic/replay/partial-release guards; security-preserving pause. The initial test incorrectly counted COMMIT text inside quoted ledger data as executable wrappers; that assertion was corrected. Installed local PostgreSQL tests passed on retained clone `vetit_disposable_onboarding_20261022_0930`, loopback port 55432:

- synthetic partial ledger rejected before changes;
- failure injected between schema execution and ledger insert rolled back both;
- schema+ledger commit and exact replay, changed ledger payload/disabled trigger denial;
- five authorization rollback groups against the newly applied package;
- pause/replay preserves all four stronger function bodies, three enabled guards and row counts;
- actual two-executor lock contention prevents duplicate ledger recording.

The new clone's prerequisite ledger rows are **synthetic metadata** for testing; they are not proof the frozen fourteen migrations were applied or accepted. Atomic apply/pause fixtures remain only in that clone, with onboarding paused. Original source database and earlier clones are preserved. Existing retained rollback fixtures temporarily disable guards only to construct forbidden synthetic states, restore them and roll everything back; no weaker legacy function or policy was restored. No hosted Auth, device, broad crash/load/deadlock or complete fourteen-step recovery acceptance is claimed. Function-body equality allows reuse of unchanged earlier business/profile concurrency checks.

## Backup and readiness blockers

Authenticated Test backup evidence remains **unverified**. Connected tools have no backup-list metadata. A fresh dashboard attempt timed out and no readable backup tab was available; no login, backup, restore or hosted query was attempted. Need project-matching successful backup timestamp/reference, inspection evidence, retention and reviewed recovery procedure. A local source ZIP, synthetic ledger or pause script is not a database backup. Backup evidence references should remain private; never commit credentials or personal records.

Next owner action: provide authenticated Test backup metadata/access and review the strict restricted-owner/pause policy. Then separately authorize a fresh read-only Test connection/ledger/prerequisite reconciliation. Hosted application remains prohibited until the full predecessor/executor/backup plan and exact payloads receive explicit approval. UI v2 receipts, real sessions/Storage and physical-device acceptance remain outstanding. English and regional-language architecture are unchanged.
