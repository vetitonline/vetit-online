# Vetit Online — local Test release checkpoint

## Local-only onboarding correction checkpoint — 22 October 2026

Continue on `codex/development-readiness-2026-10-21`, original `C:\Users\DELL\vetit-online`; base `9e818c44353096f0efdb94b73ecfb43d43ef5310`. New separate `supabase/test-project/development/seller-onboarding-v2.proposal.sql` prepares blocked-owner retries, private shared direct-RPC/direct-update validation and an explicit created/reused v2 receipt while preserving the legacy UUID RPC. No frozen release, UI, dependencies, environment, hosted data or backup branches changed. See the development README for policy decisions, privileges and exact scope.

Five rollback groups and three actual two-session scenarios passed on retained synthetic clone `vetit_disposable_onboarding_20261022_0111`, loopback port 55432. Source `vetit_disposable_corrections_20261020_1902` and first failed-test clone `vetit_disposable_onboarding_20261022_0110` remain preserved. Proposal replay passed twice and rollback counts matched; expected lock timeouts/revocation denial were asserted. Added cross-account/ambiguous-owner cases passed separately without repeating concurrency. Initial fixture/moderation-guard and output-parser failures were fixed, as documented in the README. This is local SQL execution, not hosted migration or physical-device acceptance.

Checkpoint scope: SQL proposal, rollback SQL, bounded local Postgres runner, development README and this handover. Commit locally only; a normal push needs fresh approval. Identify final local hash with `git log -1` and the final report. Existing untracked archives/candidates/evidence remain local and excluded. New evidence receipt is under the existing Codex evidence root in `seller-onboarding-v2-20261022`; no credentials are included.

Next: review the strict blocked-owner recovery policy and forward-only SQL; then approve checkpoint synchronization if desired. Hosted application still requires a separately versioned additive release, backup/executor review, exact Test approval and real Auth/PostgREST acceptance. UI v2 receipt integration remains deferred, as do device/protected-storage and broader concurrency/idempotency acceptance. Do not begin another phase automatically.

## Active development checkpoint — 22 October 2026

Preflight verified original laptop repository `C:\Users\DELL\vetit-online`, branch `codex/development-readiness-2026-10-21`, local and GitHub HEAD `434e668010d5a909a6ed0ee92e72e3e1b2e82db9`, clean tracked tree and preserved untracked recovery material. The earlier six-commit backup remains unchanged. This batch continues on the same development branch; identify its resulting commit using `git log -1` and the final chat report.

Source review found the existing hardening RPC (`supabase/migrations/20261008210707_vetit_seller_security_hardening.sql`) already provisions the caller's missing profile, locks that profile and reuses an existing active owner membership on onboarding retries. Do not duplicate this logic or infer the legacy migration has been applied to Test. The separate frozen self-profile repair contract remains unapplied and ordinary login wiring remains deferred. Variant JSONB, audited submission and immutable child-parent corrections already exist in the reviewed package. No SQL changed or executed here.

Completed backend changes:
- Seller business POST now uses the shared verified-identity helper: Auth outages return a generic no-store 503, while missing/invalid sessions retain the login redirect. Exact-origin form checks remain mandatory; this does not introduce a native bearer bypass for browser forms.
- Seller page loader uses the same helper and throws on Auth unavailability, allowing onboarding/dashboard/product pages to use their existing unavailable state rather than incorrectly redirecting to login. Verified users without memberships still reach onboarding.
- Business edits require a matching returned ID (`update(...).select('id').single()`), so RLS zero-row updates, errors or mismatched receipts cannot report success. Creation requires a valid UUID receipt from the existing atomic RPC. No automatic retry, direct profile write, role assignment or privileged key was added. Owner/admin membership checks, inactive-business restrictions and public-field allowlists remain intact.

Validation: eight new actual business-route tests and four new seller-loader tests passed; six shared cookie/bearer authentication regressions passed. Tests use injected synthetic responses and execute no SQL/network calls. Security cases cover cross-site/absent origin, wrong content type, missing configuration, unavailable/missing identity, duplicate/file-valued fields, malformed IDs and URLs, invalid business types, protected-field injection, membership owner/business/role/status mismatches, inactive/archived/missing businesses, malformed RPC receipts, zero-row updates and generic error privacy. Targeted strict TypeScript passed for both changed production files and imported dependencies using installed TypeScript with `--types astro/client`; an initial command referenced nonexistent `src/env.d.ts` and was corrected, without generating that file. `git diff --check` passed. No full builds, installs or unchanged mobile suites were repeated.

Scope: two production TypeScript files, two focused test files and this handover only. English/default locale, Indian language extensibility, buyer/admin permissions, marketplace and native source are unchanged. Untracked ZIPs, candidates, raw evidence, caches and temporary tools remain local and excluded. This batch is approved for a normal development-branch commit/push only; no main/checkpoint branch updates, explicit deployments, environment changes or hosted writes. Automatic Vercel Preview may follow GitHub push; its environment and acceptance are not implied by tests.

Remaining gates: authenticated Test backup/restore evidence; exact executor/ledger transaction review; hosted contract/GRANT/RLS and signup/profile/onboarding role acceptance; real buyer/seller/admin sessions; native protected storage/devices; revocation, concurrency and idempotency. Next bounded task is a review of the exact Test onboarding RPC against the local provisioning/retry contract and the approved correction package, then separately scoped hosted acceptance once prerequisites and approval are in place. Do not apply historical SQL blindly or start a new phase automatically.

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
