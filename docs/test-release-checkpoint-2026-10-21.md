# Vetit Online — local Test release checkpoint

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
