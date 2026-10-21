# Vetit Online — local Test release checkpoint

## Latest bounded development batch — 21 October 2026

This section supersedes the older push-pending notes below. Original laptop access was verified at the same repository on `codex/development-readiness-2026-10-21`, starting at `0e6655435666b28d1622660c03c762287684f1aa`. GitHub comparison confirmed all six commits above recovery `1cfcc1b` on `codex/test-release-checkpoint-2026-10-21-r1`. Main and both backup branches must remain unchanged. Untracked recovery files/ZIPs/caches are preserved and excluded.

The four backend blockers already have local corrections: caller-only `ensure_my_profile()` (frozen step 14); JSONB key counting and typed variant checks (steps 1/13); audited submission with direct DML restricted; immutable child listing IDs (step 12). Existing rollback SQL evidence is `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\development-pass-20261021\backend-regression.log` and `reviewed-boundaries.log`. These are local results, not hosted fixes. Frozen migrations were not edited or applied.

New implementation: shared API authentication distinguishes rejected/missing sessions (401) from Auth outages, throttling and unknown errors (503), for both website cookies and native bearer tokens. All errors deny access; diagnostics are not returned. No cookie fallback for an invalid bearer header. Six new tests exercise the actual verifier and session endpoint; all pass. Three existing seller-submission boundary tests also pass. No full build, installation, SQL execution or unchanged mobile suite was repeated; previous SQL/build/type evidence retains its original scope.

Authentication review: website verifies identity with Auth; seller access requires current active business membership and catalogue role; admin UI uses trusted app_metadata, while moderation needs database scope checks. Native protected-storage adapter remains approval gated and is not evidence of real Keychain/Keystore execution. Missing-profile client invocation remains deferred until hosted Test contract acceptance. Buyer/seller/admin real sessions, device storage, hosted RLS/Storage, revocation, concurrency and idempotency acceptance remain outstanding. English/default locale and Indian language extensibility are unchanged.

GitHub reports a successful Vercel status on the backed-up starting commit, deployment `7LEcKbHG8CgSkyq1ZSDBGDcKxuKf`. The dashboard required authenticated access, so Preview environment identity was not independently verified. Branch pushes may create automatic Previews; no promotion or production setting change is authorized.

This batch authorizes a normal push of completed changes to `codex/development-readiness-2026-10-21`, which was absent remotely at preflight, rather than updating the checkpoint branch. Confirm the resulting commit/push in Git history and the final chat report. Local untracked evidence and tools are not synchronized by GitHub. Next bounded task: verify the development Preview environment using authenticated dashboard evidence, then resolve Test backup/executor review gates before requesting separately scoped hosted acceptance/application approval. Do not automatically begin another development phase.

Continue on the original laptop in `C:\Users\DELL\vetit-online`, branch `codex/development-readiness-2026-10-21`. Reopen the same Codex workspace. On iPhone return, verify filesystem access, repository root, branch, HEAD and untracked files before editing; pause if the laptop is unavailable. Do not clone or switch environments automatically.

## Secured local work

- `098bade82a59362fb96d99a00ee6b1199b869812`: original discovery/image/profile development.
- `5d969487f47f6c84d7404d5c0ef35c75caf7dd3f`: opt-in Windows runtime and responsive fixes.
- `aee37def06a23eb0515fedf58417d949175eb2f3`: reviewed ten-file seller/availability/shared-navigation cohort.
- `8e492f40d3c3012fb026d5912226b1ba9a8c0712`: reviewed three-file SQL safeguard/test cohort.
- `fa0d747fb38ea7f1ef02885bdab5eb4581f60e19`: frozen fourteen-migration release, required price-correction provenance, offline executor draft, focused tests and release/handover documentation. A subsequent documentation checkpoint records this verified commit status; identify current HEAD with `git log -1`.

Release directory: `supabase/test-project/releases/vetit-test-20261021-r1`. The manifest records fourteen CLI versions from `20261021133609` through `20261021133642`, exact source/payload hashes and preserved foundation entries. Release-local Git attributes disable text conversion for SQL and hash-bound metadata. The payloads remain unchanged. Source paths record the freeze-time source bytes; Git normalization in historical source files is not permission to change release hashes. Verify frozen payloads directly before future use.

Whitespace review preserves one inherited two-space blank line at step 12, line 216, rather than invalidating frozen SQL hashes. CRLF is declared a valid line ending for release files; ordinary whitespace checks remain enabled. This is a scoped style waiver, not a SQL/security verification exception.

`scripts/draft-test-release-executor.mjs` reads and verifies the release and prints an **execution-disabled** plan. It has no database/network/subprocess/apply path. Usage:

```powershell
node scripts/draft-test-release-executor.mjs supabase/test-project/releases/vetit-test-20261021-r1
```

Three focused tests passed: real package remains offline/disabled; target/count/order/foundation/path mistakes fail closed; altered bytes are rejected. Earlier 16 continuation tests, mobile TypeScript, template compilation, rollback SQL and scoped runtime/browser evidence were reused because their reviewed source hashes match. No hosted SQL or migrations were run in this checkpoint batch.

## Hosted prerequisite results and unresolved gates

Counts-only Test snapshot at **2026-10-21 13:43:53 UTC**: zero duplicate default-address/base-cart-line/payment-reference groups, invalid payment parents, order component/line-total mismatches, multiply booked slot groups, future default-resource overlap pairs and held slots. Exactly one canonical service/start uniqueness constraint exists. Ledger still contains the same four foundation entries. These are point-in-time prerequisites, not concurrent/authenticated acceptance; repeat immediately before any approved migration.

Permissions review: service_role has TRUNCATE/REFERENCES/TRIGGER on all 34 public tables; eight authenticated-callable SECURITY DEFINER functions remain acceptance gates. Four closed inventory/payment tables have zero anon/authenticated CRUD grants. No grants were changed. Privilege/default-ACL decisions remain explicit review work.

**Database backup remains unverified.** Connected Supabase tools expose no backup-list metadata. A read-only visit to the exact Test dashboard backup page redirected to sign-in; no credentials or login were attempted. Need authenticated dashboard evidence of latest successful backup/restore point, retention and recovery target, plus a reviewed restore procedure. The local release ZIP is not a database backup. Do not invoke restore or start a backup without separate approval.

The fourteen BEGIN/COMMIT wrappers are unchanged. The draft records unresolved schema-plus-ledger atomicity, lock/statement timeout proposals, stop-on-error and partial-commit/resume handling. It does not pretend the release is one atomic transaction and cannot execute SQL. An actual executor or wrapper-normalized payload set still needs separate design/review and exact approval, as does any hosted application. Hosted sessions/roles/Storage/concurrency/idempotency and physical devices/protected storage remain unverified. Keep profile-RPC client wiring deferred until Test contract acceptance.

## Git synchronization — prepared, not executed

Destination repository: `https://github.com/vetitonline/vetit-online.git`.
Proposed **new remote branch**: `codex/test-release-checkpoint-2026-10-21-r1` (read-only check found it absent on 21 October; recheck immediately before any push).

After the user's explicit push approval, the intended operation is a non-force creation of that branch from the final reviewed local HEAD:

```text
git push origin HEAD:refs/heads/codex/test-release-checkpoint-2026-10-21-r1
```

This command is a proposal only. If the destination exists or the source differs from the approved checkpoint, stop. Do not force, merge, update main, alter the protected recovery branch or include untracked files. A branch push may automatically create a Vercel Preview; approval must acknowledge that possibility or separately establish approved deployment suppression. No Vercel settings were changed.

GitHub main was verified at `00a064b2dae94a3d1b06222db9d3cddedac89edb`, already an ancestor of local development HEAD. Cached origin/main points elsewhere and is stale; it was not fetched or rewritten. Remote recovery remains `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`. No pull/merge is needed to create a separate backup branch. After any approved push, verify its remote SHA; laptop continuation stays on this current local branch/checkpoint.

All newer commits remain local until push approval. Untracked ZIPs, prior recovery candidates/scripts/reports, temporary artifacts and CLI/tools stay on the laptop and are excluded from commits. The separate source ZIP and tool-installation receipts live under the existing Codex evidence directory; they are not remotely synchronized by the proposed push. Do not discard them because reviewed work has been committed.
