# Recovery closeout and development baseline — 22 October 2026

**Discovery is closed for safe local development. Full production disaster recovery is not certified.** Do not repeat broad searches without new evidence. Production, hosted SQL, restores and deployments remain approval-gated; missing operational proof does not block isolated development.

## Verified preservation

- Authoritative laptop: `C:\Users\DELL\vetit-online`; branch `codex/development-readiness-2026-10-21`; sprint starting local/GitHub checkpoint `c894ca6b438e1f4488f4366ebb95cb2269d0d06f`. Verify the resulting SHA in Git and the final synchronization receipt, not a self-referential hash in this file.
- Remote recovery `codex/recovery-checkpoint-2026-10-21-1cfcc1b` at `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`; release checkpoint `codex/test-release-checkpoint-2026-10-21-r1` at `0e6655435666b28d1622660c03c762287684f1aa`. All local branch commits were remote-reachable at closeout. Current tracked tree was clean; untracked archives/evidence remain private and excluded.
- Historical 11 October branch `backup/vetit-checkpoint-2026-10-11`, `f7bbb0402cd9893a83dc2ffcf2f9687f28d74ff9`: 80 changed files, 122-file tree, ancestor of remote recovery. Git integrity passed in the preceding audit; do not repeat unchanged checks.
- `C:\Users\DELL\vetit-online-backup-2026-10-20-1040\project` preserves website/mobile/SQL/configuration/Git. The earlier `1033` directory is incomplete (Git metadata only). Both supplied ZIPs and their separate copies remain preserved; old inventory/documentation calling every database backup absent is superseded below.
- Completed **Test** export: `C:\Users\DELL\Documents\VetitBackups\Test\backup-20261018T142316Z-e9a26361`, completion record 18 October 14:24:48 UTC. Dump 606,515 bytes and password-free roles export 5,956 bytes match recorded hashes; archive listing readable. Saved record binds Test `apfyfmokcynqiaxqvvxx`. Four earlier attempts were incomplete, including TLS/authentication failures. Do not repeat authentication or assume those failures invalidate the later completed export.
- D: contains PostgreSQL tools/local test state; `D:\Documents\ChatGPT\vetit recovery audit` has no committed application or remote. Previous targeted C:/D: searches covered likely project/backup/Documents/Downloads locations; no new drive scan is warranted now.

## Scope and genuine operational gaps

- Repository roles: `vetitonline/vetit-online` is the web/mobile/shared-backend monorepo; web `src/`, native `mobile/`, shared contracts under `src/lib/`, SQL under `supabase/`. `vetitonline/veitit-online-backup` is empty, not the actual remote recovery destination. Only these two repository identities are evidenced; no third URL was found in known Git configs or 88 relevant documents. Do not invent a third repository or repeatedly request its URL.
- Current production backup history/retention/PITR and separate Storage object-byte recovery remain unverified. The Test export excludes Storage bytes, role passwords, extension binaries and platform configuration; no restore of that export was verified. A synthetic local rehearsal is separate evidence. Existing backup-list tooling is unavailable; required read-only API capability is `database:read` / `backups_read`, not SQL/write permission. Underlying token scope is not proven denied.
- Project `aaqnglzqcfdytythqzju` is named Vetitonline; its production binding is not established by the name alone. Do not use it for development. Dashboard authentication remains manual pending; stop sign-in retries.
- Original historical Changes-card base/preimage for the ten-file/+4,952 export remains unresolved; the exported payloads were preserved/compared. Do not claim original patch provenance is complete.
- Default-branch Dependabot alert details are not exposed by current tools. Root development audit retains a high cache-version finding despite the tested hash-pinned downstream patch. Preserve that patch and do not blindly apply the cache 4.3.0 PR: its reviewed candidate reproduced the issue.

## Development baseline and safe continuation

- Astro 7.3.7 / Vercel adapter 11.0.12; pinned Vite 8.3.3 and scoped regex 6.3.0; root TypeScript 6.0.3. Native Expo 57, React 19.2.3, RN 0.86.3, TypeScript 5.9.x. Use installed dependencies; root/mobile lockfiles stay separate.
- Four historical backend blockers already have reviewed local corrections and saved local SQL evidence: typed variant JSONB key count, caller-only profile provisioning, protected submission transitions and immutable child parents. Frozen fourteen-step release, stronger onboarding r2 and explicit GRANT/RLS proposals are preserved, not claimed hosted-installed. Do not duplicate or replay them blindly.
- October 30 readiness remains explicit least-privilege Data API grants plus RLS/policy validation; no blanket anonymous/default grant. Profile-init client wiring must wait for the approved RPC deployment/real-session acceptance. No new SQL is required for this discovery UI sprint.
- English remains default with the existing Indian locale resolver. Admin-owned taxonomy, seller restrictions, moderation, buyer/provider appointments and session boundaries remain in place.
- Next backend milestone: atomic catalogue revision/compare-and-save and coordinated web/native/legacy cutover, per the existing plan. Current timestamp precheck does not establish database concurrency safety.
- Physical devices, protected storage, hosted buyer/seller/admin sessions, Auth/Storage recovery and full concurrency/idempotency acceptance remain outstanding. No source-only or fixture check certifies them.

Sprint source/test changes and actual validation outcomes are recorded in `docs/test-release-checkpoint-2026-10-21.md` and separate `marketplace-sprint-20261022` evidence. A development push synchronizes committed source only; laptop-local backups, credentials and untracked evidence are not uploaded.

22 October atomic catalogue update: the next-backend-milestone entry above is now implemented and locally tested, with a forward-only migration candidate and coordinated web/native revision contract. Hosted activation and release acceptance remain blocked pending the documented Test package/backup/executor review and separate approval. See the implementation section in `docs/seller-catalogue-atomic-edit-plan-2026-10-22.md`; no previous recovery evidence is superseded by synthetic SQL results.
