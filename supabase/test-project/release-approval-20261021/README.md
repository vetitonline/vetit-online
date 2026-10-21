# Vetit Online — bounded Test approval package

Prepared locally on 21 October 2026. **Review material only: no executable release, generated migrations, hosted approval or deployment.**

Repository: `C:\Users\DELL\vetit-online`; branch `codex/development-readiness-2026-10-21`; HEAD `5d969487f47f6c84d7404d5c0ef35c75caf7dd3f`. Remote recovery preservation remains the previously verified `codex/recovery-checkpoint-2026-10-21-1cfcc1b` at `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`; no remote check/write was needed in this batch.

## Reviewed local integration

| Cohort | Finding | Safe next integration |
| --- | --- | --- |
| Seller validation | Shared business parser rejects overlong/control/whitespace URLs, unsafe schemes and embedded credentials; onboarding input has the same 2048 limit. Existing authenticated, same-origin API and owner/admin membership checks remain intact. | Checkpoint validation + form + continuation tests together; no permission or publication changes. |
| Appointment availability | Shared parser rejects impossible calendar dates and duplicate scalar query fields, preserving valid leap days/timezone offsets. Existing public read route stays bounded to eligible future slots, 31 days and 100 results. | Checkpoint parser + continuation tests; verify actual anonymous visibility/role policy against Test later. Read parsing does not prove booking concurrency. |
| Shared navigation | Web and native use one four-destination module, with real artwork, English default and the existing Indian-language fallback registry. Products/animals clear filters; services remains native; appointments explicitly opens the existing website. | Keep App, native/web components, shared JS/types, homepage and tests in one cohort; do not commit components without their imports/declarations. |
| SQL safeguards | Grant assertion now checks table/RLS/policy role and unexpected read policies; additional tests preserve existing profile role/name and reject absent identity/account. | Review separately from UI. Optional grant assertion is not a missing-grant fix; no client profile-RPC invocation until the hosted contract is accepted. |

Thirteen implementation/test/documentation-source files match the saved continuation SHA-256 receipt; only the evolving handover differs. Reuse its 16 passing targeted tests, mobile TypeScript, three template compilations and four rollback-only SQL groups. The newer runtime checkpoint and recorded 28 signed-out browser routes, eight shortcut activations and four viewport widths remain separate evidence. No suite/build/SQL was rerun here. Hash matching proves source preservation, not hosted security or physical-device behavior.

## Exact proposed database source composition

`proposed-source-manifest.json` records exact source paths, SHA-256 hashes, historical versions and conservative dependency order. Four foundation sources and all thirteen frozen source/payload pairs were checked; the original candidate and archives remain untouched.

Preserve the four existing foundation ledger entries; **do not replay them**. Proposed additive core order:

1. Seller JSONB variant key-count correction.
2. Booking participant role-scoped RLS correction.
3. Buyer cart, inventory and fulfilment.
4. Service booking transaction.
5. Appointment lifecycle.
6. Appointment operations.
7. Rejected seller editing/resubmission guards.
8. Admin listing queue.
9. Durable moderation and protected listing transitions.
10. Low-risk automatic approval definitions (no worker/policy activation approval).
11. Service Storage boundaries.
12. Business-scoped reviewer/moderation authorization.
13. Seller price validity correction.

Proposed additional decision: append `development/authenticated-profile.proposal.sql` after the core. It is a narrowly exposed authenticated self-repair RPC: actual Auth caller required, empty search_path, no caller-supplied role/identity, customer role default, conflict replay preserves existing fields, PUBLIC/anon/service_role execution revoked. Its SECURITY DEFINER surface still needs hosted owner/ACL/role testing. Keep client wiring deferred.

`development/data-api-grants.proposal.sql` is **excluded by default**, optional after core: canonical fulfilment SQL already grants authenticated participant SELECT. Its named-policy/non-null-predicate check does not prove predicate semantics; a permissive predicate or inherited grants must be detected by catalog/role acceptance, not trusted from the guard alone.

No proposed release version has been assigned. Historical steps 7–11 are not a safe generated release sequence when newly versioning earlier prerequisites. After fresh ledger comparison, generate a coherent new ordered sequence for the selected unapplied sources using an existing approved Supabase CLI in a new isolated release directory. Preserve every old candidate/version/hash; stop if any source was already applied. Do not run the older six-source executor, default-directory db push, ledger repair or an unreviewed packaging script. The old manifest's `sourceHead` is historical provenance, not current HEAD.

## Hosted baseline and remaining security gates

Last hosted evidence is **20 October**, project `apfyfmokcynqiaxqvvxx`, Vetit Online Test, `eu-west-1`. It showed four foundation entries, 34 public RLS tables, the JSONB function defect, overbroad booking membership read scope, absent later commerce/appointment/moderation/service RPCs and older listing guards. No newer hosted query was executed. Treat those risks as unresolved until fresh evidence proves otherwise; local SQL success does not mean they are installed.

For the recorded October 30 Data API change, keep explicit per-role access decisions alongside RLS. Current official guidance confirms grants and RLS are separate controls; the exact October 30 date comes from the previously reported notification and was not independently reconfirmed in this batch. No new SQL was needed for this review.

- `anon`: only deliberately public taxonomy/published-marketplace/eligible-slot reads; never broad table grants or profile/moderation writes.
- `authenticated`: ownership/participant/business-role restrictions and scoped RPC execution; retain legal-name column restrictions and reviewed-listing immutability.
- `service_role`: BYPASSRLS does not replace SQL ACLs; no blanket/default table grants. Review privileged RPC grants and any intentionally closed tables explicitly.
- Inventory/payment public tables intentionally remain client-closed. Private appointment/moderation schemas and Storage have independent ACL/RLS boundaries. Inspect effective inherited/PUBLIC ACLs, function owners/search_path, views, default privileges and Storage policy predicates.

Do not enable schedulers, notifications, payments, reviewer/legal-policy provisioning or automated approvals as an incidental migration action. Preserved definitions are not operational activation approval.

## Approval gates and stop conditions

1. **Next requested approval — fresh read-only Test preflight only.** Verify exact project identity/health, full ledger, relevant schema/function bodies, ACLs/default ACLs, policies, private schemas and bucket configuration. Include aggregate-only data prerequisites for uniqueness, holds and slot/resource overlap; no customer rows, object contents, credentials, accounts or writes. Stop on project mismatch, unexpected ledger entries, missing prerequisites or policy drift.
2. After preflight, approve exact source inclusion (profile RPC yes/no; optional grant assertion excluded unless chosen) and local CLI version generation. Any CLI installation requires separate permission. Produce source-to-payload hashes, versions, executor/transaction boundaries and timeouts for review. CLI generation itself authorizes no hosted execution.
3. **Separate hosted migration approval**, only for a named, immutable generated package and exact Test project after verified backup/recovery procedure. Preserve foundation ledger; no destructive data cleanup or rollback-by-deletion. On drift/failure stop and report; do not improvise repairs. No production actions.
4. Separate bounded synthetic Test accounts/writes and hosted acceptance approval: Auth/cookie/bearer/session expiry and revocation, role/cross-business denial, profile replay/role preservation, listing submission and reviewed-child movement, private Storage upload/read/delete/overwrite denial, booking contention/idempotency/retry/crash persistence and fulfilment authorization. Inspect effective results through the real API, not only catalog names.
5. Physical Android/iOS and OS-protected Keychain/Keystore, native-to-web separate sessions and deep-link failure UX require device/session acceptance. Native protected-storage bindings stay fail-closed. `openWeb` currently suppresses link-launch failure feedback; record this as a UX follow-up, not a claim of shared authentication.

## Runtime/dependency and release limits

The Windows repair is an opt-in serve-only native-loader workaround using a process-scoped experimental Node resolver flag. The isolated fixture passed; ordinary Vercel-adapter-backed startup, production fonts and actual hosted sessions remain unaccepted. No dependencies, lockfiles, environment variables or deployment settings changed. No fresh dependency security-advisor scan is claimed.

Next implementation milestone: review/checkpoint the intact UI/validation cohort, prepare the exact versioned Test release after approved preflight, then wire shared web/mobile self-profile initialization only after Test exposes and accepts that contract. Preserve admin-controlled categories, moderation and existing appointment functionality; do not replace unsupported native features.

## Evidence

Evidence root: `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7`.

- `development-continuation-20261021/checkpoint.json`, `focused-backend.sql`, `focused-backend.log`: matching source receipt, previous 16 tests/type/compiler and four rollback groups.
- `browser-acceptance-20261021/expanded-runtime-checkpoint.json`, `browser-acceptance-expanded-results.json`, screenshots and `runtime-review-local-commit.json`: scoped UI/runtime verification and five-file checkpoint.
- `supabase-test-preflight-20261020-9ff89d4/preflight-report.md`, `catalog-evidence.json`, `source-comparison.json`, `column-grants.json`: historical hosted baseline, not fresh attestation.
- `supabase/test-project/reconciled-candidate-20261020-r5/package-manifest.json`: preserved historical composition.
- Official reference: https://supabase.com/docs/guides/api/securing-your-api (reviewed 21 October; grants/RLS/default privilege separation). Changelog markdown could not be read by the web tool; HTML fallback was read, with no October 30 grant notice found. Do not infer a changed deadline from that absence.

This batch changes only local approval documentation/manifests and the handover. No feature source edits, new commit, installation, merge, push, hosted query, migration, database mutation or deployment.
