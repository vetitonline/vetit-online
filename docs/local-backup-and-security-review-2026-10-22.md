# Local backup inventory and security continuation — 22 October 2026

Repository: C:\Users\DELL\vetit-online. Branch: codex/development-readiness-2026-10-21. Starting HEAD: 24016c83da991fe937a2af7e3cd4a89fa6aa776c. Tracked tree/index were clean; all existing untracked recovery material is excluded from this checkpoint.

## Backup evidence: verified scope and limitations

Read-only metadata inventory covered the original repository, both named C-drive backup directories, C:\Users\DELL\Vetit, D:\VetitTestTools and the existing external evidence root. Only top-level Vetit/Postgres-named temporary directories were additionally inspected. No unrelated personal folders or other drives were searched. Dependency/generated directories, .git, pgdata/data and symbolic links were excluded from recursive candidate discovery. The inventory has 1,408 matches including vendor SQL/documentation/tool files; that count is not a count of backups. Separate backup-directory totals below include all regular files, including Git metadata, without reading their contents. Dates below are filesystem last-modified UTC, not database backup-success timestamps. No password/config/data row was printed; no new database backup, restore or SQL connection was made.

| Backup/source snapshot | Regular files | Bytes | Directory modified UTC | Meaning |
| --- | ---: | ---: | --- | --- |
| C:\Users\DELL\vetit-online-backup-2026-10-20-1033 | 1,000 | 4,230,274 | 2026-10-20T09:33:47.512Z | Earlier project snapshot; not certified complete/hosted database backup |
| C:\Users\DELL\vetit-online-backup-2026-10-20-1040 | 1,407 | 10,513,579 | 2026-10-20T10:17:07.393Z | Source/Git/evidence preservation plus archive copies; prior verification.json and manifest preserved |

| Exact artifact location | Bytes | Modified UTC | Classification |
| --- | ---: | --- | --- |
| `C:\Users\DELL\vetit-online\vetit-progress-2026-10-20.zip` | 981945 | 2026-10-20T09:47:08.435Z | Source/evidence archive |
| `C:\Users\DELL\vetit-online\vetit-source-discovery-2026-10-20.zip` | 51989 | 2026-10-20T10:12:31.355Z | Source/evidence archive |
| `C:\Users\DELL\vetit-online-backup-2026-10-20-1040\cloud-archive-2026-10-20\vetit-progress-2026-10-20.zip` | 981945 | 2026-10-20T09:47:08.435Z | Source/evidence archive |
| `C:\Users\DELL\vetit-online-backup-2026-10-20-1040\source-evidence-comparison-20261020T101707Z\vetit-source-discovery-2026-10-20.zip` | 51989 | 2026-10-20T10:17:07.428Z | Source/evidence archive |
| `D:\VetitTestTools\Postgres17\postgresql-17.11-5-windows-x64-binaries.zip` | 381531864 | 2026-10-13T19:02:24.669Z | PostgreSQL installer |
| `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\dependency-integration-20261020-b0e56a3\before-all-branches.bundle` | 4263442 | 2026-10-20T17:54:24.765Z | Git history bundle |
| `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\release-generation-20261021-r1\vetit-test-release-20261021-r1.zip` | 69145 | 2026-10-21T13:38:19.455Z | SQL release source package |

The progress ZIP has 65 entries and one SQL entry, vetit-online/supabase/migrations/20261004000000_initial_marketplace.sql (15,685 bytes), the existing foundation migration. The source-discovery ZIP has 12 entries and no .sql/.dump/.backup/.bak/.gz entry. Previously reviewed source-export findings remain applicable; archive metadata is not database provenance. No extraction or replay was performed. The Supabase CLI tarball in the evidence tools directory (64,682,222 bytes, modified 2026-10-21T13:33:28.326Z) is tooling, not backup data.

160 non-vendor SQL files in the project/backup/evidence roots and 85 SQL files in known Vetit temporary folders have no PostgreSQL dump header, COPY FROM stdin or Data-for-Name dump markers. These are migration/proposal/test sources; marker absence alone cannot prove their origin or exclude every data statement. No .dump/.backup/.bak data artifact was found in this bounded scope. **No inspected artifact is verified to contain actual hosted Test or production Supabase data.** This does not prove that backups do not exist elsewhere. Existing local synthetic PostgreSQL test databases/cluster are development state, not hosted backup evidence.

Available tools under D:\VetitTestTools\Postgres17\pgsql\bin: pg_dump.exe 613,888 bytes; pg_dumpall.exe 194,560; pg_restore.exe 371,200; pg_basebackup.exe 299,520. Each is modified 2026-09-30T12:17:28Z (local creation 2026-10-13T19:04:38Z). Presence does not mean any was executed against Supabase. D:\VetitTestTools\Postgres17\appointment-test-cluster\PG_VERSION is 3 bytes, modified 2026-10-13T19:31:04Z (filesystem display precision); it identifies a local cluster marker, not a physical backup. No repository pg_dump/pg_restore backup-creation script was located in the reviewed scripts directory. scripts/onboarding-atomic-plan.mjs validates supplied backup metadata offline; scripts/draft-test-release-executor.mjs is a gated review draft, not a backup utility. No script was invoked to create/restore a backup.

Full exact per-file paths, creation/modification timestamps and sizes remain privately in the external evidence directory C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\catalogue-concurrency-20261022: local-backup-inventory.json, dump-classification.json and temp-sql-inventory.json. They remain local and are not included in GitHub. Existing project backups may contain private configuration; they were neither opened nor uploaded.

Manual verification remains pending: authenticated Test backup identity/reference, successful timestamp, retention/PITR window, reviewed restore procedure and Storage-object recovery coverage. Production backup evidence requires its own exact project identity; Test evidence is never production evidence. No authentication retry was made and this pending step does not block local development.

## Dependency findings and bounded remediation

A single read-only root pnpm audit --json returned exit 1 because advisories exist: **8 advisories, 3 high, 4 moderate, 1 low**, across three resolved packages. No dependency, manifest, lockfile or installed tree changed. This is distinct from GitHub's earlier default-branch push banner reporting four alerts (2 high/2 moderate). The authenticated alert IDs/manifest paths/current state were unavailable; no dashboard retry or unsupported authentication attempt was made. Do not claim exact correspondence or closure of the four GitHub alerts. Mobile dependencies were not separately audited in this bounded root check.

| Resolved package / parent | Advisories | Bounded candidate |
| --- | --- | --- |
| path-to-regexp 6.1.0 via @astrojs/vercel -> @vercel/routing-utils 6.6.0 | High GHSA-9wv6-86v2-598j (ReDoS) | Prefer upstream parent fix; otherwise scoped override to reviewed 6.3.0, with route-generation acceptance. Both vulnerable 6.1.0 and the separate updated alias 6.3.0 exist; the alias does not remove the vulnerable dependency. Installed superstatic.js imports both. |
| http-cache-semantics 4.2.0 via Astro 7.3.7 | High GHSA-ch52-4w7c-c8xp (cross-user cache disclosure) | Registry audit reports >=4.3.0; the public GitHub advisory inspected still says no patched version. Verify official release/registry integrity and actual fix before selecting any version. Do not claim 4.3.0 is validated or install a guessed patch. Review actual Astro cache reachability; devDependency classification is not proof of no SSR exposure. |
| Vite 8.3.2 via Astro/vitefu | High GHSA-587h-7wmj-h5pm; moderate GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg; low GHSA-9jrq-w75r-8gcw | Reviewed patched target 8.3.3; Astro declares ^8.3.1, so a targeted resolution is within its range. Test Windows local runtime/editor boundary, filesystem denial, SSR and navigation after an approved dependency update. |

Sources: [path-to-regexp advisory](https://github.com/advisories/GHSA-9wv6-86v2-598j), [cache advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp), [Vite/Windows advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm). Full eight IDs/versions/severities are saved in dependency-audit-summary.json. Exposure/reachability is not fully established. Keep local dev servers private; do not treat that as remediation. No production configuration changed.

Proposed approved dependency batch: pin reviewed same-major resolutions only; update root lockfile with the existing package manager, no broad audit --fix/upgrade, preserve mobile lockfile and Supabase versions. Review exact diff and integrity, rerun advisory lookup once after inputs change, then affected runtime/route/SSR checks and build. Installation/lockfile update needs separate approval under the existing dependency restriction. Need a redacted GitHub Dependabot alert export (GHSA, package, manifest, affected range, state) to reconcile the original four without another sign-in attempt.

## Atomic catalogue protection: not yet implemented

See seller-catalogue-atomic-edit-plan-2026-10-22.md for the exact bounded migration/contract rollout and acceptance matrix. A new synthetic diagnostic against the actual writeSellerCatalogue module confirmed that two overlapping requests with the same saved timestamp both reach the legacy RPC and succeed, while a sequential stale request is rejected with 409. This reproduces the application TOCTOU gap; it is not a real PostgreSQL two-session test or a passing protection test. Source/runtime remains unchanged. No previously passed product suite/build was repeated.

Reason for deferral: enforcing the condition requires an additive database contract plus coordinated web/native/legacy writer handling. Calling an uninstalled RPC breaks the current API; leaving legacy edits unrestricted bypasses protection. Merely rechecking in JavaScript or adding a process mutex cannot solve multi-instance/database concurrency. Under the owner's conditional instruction, the required migration/tests are documented for approval instead of claiming a local-only complete fix.

Only reviewed documentation is committed/pushed in this batch. Existing source/API behavior, stronger RLS, blocked-owner protection, frozen releases, all recovery files and both lockfiles are preserved. No hosted SQL, database restore, migration, dependency install, production configuration change or explicit deployment occurred. A normal development-branch push can still trigger the previously accepted automatic Vercel Preview; no Preview or production promotion was requested.
