# Vetit Test catalogue release candidate r1 — 22 October 2026

**Local preparation only. Not linked, hosted-applied, execution-ready or deployment-approved.**
Target: Test `apfyfmokcynqiaxqvvxx`. Source checkpoint:
`f07a23cd9f06c4ecca46b8fc447ce8a1cac93ad1`, branch
`codex/development-readiness-2026-10-21` in `C:\Users\DELL\vetit-online`.

## Exact order and provenance

The adjacent manifest pins every prerequisite path/version/name/SHA-256 and
critical function body. Existing releases are referenced, never modified/copied
as replacement backups. Preserve their original byte attributes.

1. Preserve the four existing Test foundation ledger entries:
   `20261008223605`, `20261008233606`, `20261009000613`, `20261009082833`.
   Do not replay/rename them or infer installed SQL from filenames alone.
2. The fourteen entries in `../vetit-test-20261021-r1/release-manifest.json`, in
   its exact order `20261021133609` through `20261021133642`. These include
   variant validation, participant RLS, inventory/fulfilment, booking/appointments,
   rejected resubmission, admin/durable moderation and Storage boundaries,
   scoped administration, monotonic price validation and caller-only profile
   repair. **Profile repair is already step 14; do not add a duplicate.**
3. Only the **apply** entry `20261022091620` from
   `../vetit-onboarding-20261022-r2/manifest.json`. It preserves stronger
   blocked-owner, direct validation, profile/retry and explicit reuse behavior.
   Its pause entry is not an installation prerequisite. Do not use weaker r1.
4. This package's apply migration `20261022134631_catalogue_revision_guard.sql`.
   SHA-256 `2a0aa8a92bbdb722ec3f5d17a82126faf33e5ad0543f6431355d6f6990b253ab`.
5. **Contingency only, separate approval:** pause
   `20261022151738_vetit_catalogue_pause.sql` under `recovery-review/`.
   SHA-256 `a96b74ed72993e6bb97946d38581776d05315218967d784adfc363ddd91b221b`.
   It must never run automatically after apply.

Nineteen exact predecessor ledger versions are required before catalogue apply;
twenty are required before pause. Names and single-array-element raw SQL records
for the fourteen/onboarding/catalogue entries must match. Foundation records
have known names but require independent installed-definition provenance.
An alternate body-only ledger convention, missing/extra/reordered versions or
partially installed schema is a blocker, not permission to repair history.

## Offline verifier and transaction review

From the repository, run:

```text
node scripts/catalogue-release-plan.mjs supabase/test-project/releases/vetit-catalogue-20261022-r1
```

This only verifies files and prints disabled readiness. The script has no
network, database, subprocess or apply path. Its exported review builder requires
recent backup metadata and an explicit reviewed owner role. Metadata structure
is not proof of backup authenticity. Generated SQL checks an operator Test-project
attestation; that flag is **not** independent connection/project identity proof.

The catalogue apply/pause review transaction takes the shared release advisory
lock plus an exclusive ledger lock, verifies exact history, installed function
bodies/owners/search paths/security modes, rejects unrecorded partial schema,
and binds DDL plus exact raw-payload ledger recording in one commit. It verifies
revision/child triggers, grants, private-helper isolation and RLS, preserving all
public policy definitions. Exact replay verifies state and never reruns DDL.
Apply after a recorded pause is rejected; it cannot silently reopen writes.

This does **not** implement or approve a hosted executor for the preceding
fourteen explicit transaction-wrapped payloads. Their wrapper-aware per-step
schema/ledger executor and partial-prefix recovery remain review gates. Never
wrap them blindly, run root `db push`, use `migration repair`, fabricate ledger
entries, or replay historical SQL exports. Preserve already committed earlier
steps on failure; stop and reconcile exact ledger/schema/hashes before an
individually approved resume. Do not claim whole-release atomicity.

## Catalogue and October 30 security boundaries

- Web and native share opaque decimal bigint revisions, versioned receipts and
  HTTP 409 handling. Compare/save is locked and atomic; stale writes cannot
  obtain a new token behind the user's back. No automatic retries or legacy
  unguarded edit fallback. Deploy clients only with matching v2 support.
- Existing ownership, active membership/business, category/species/typed JSONB,
  price validation, submission/moderation and immutable-parent guards remain.
  Child/image changes invalidate the aggregate; guarded direct image reservation
  stays compatible. Reads reject mixed snapshots. Unknown outcomes retain drafts.
- New RPCs grant EXECUTE only to authenticated. PUBLIC/anon/service_role and
  private helper access are revoked; existing RLS stays enabled. The only new
  column grant is authenticated SELECT on `catalogue_revision`.
- No new public table/default ACL/blanket anonymous grant. Existing step 3
  already provides explicit authenticated participant SELECT and RLS for
  `fulfilment_events`; the optional grant proposal is not another migration.
  Anon published reads, authenticated participant/owner access and service-role
  operational access are separate decisions. Residual service-role non-CRUD and
  creator/default ACLs still require fresh review; do not assume all are minimal.
- Future/recreated public tables require explicit reviewed grants alongside RLS
  and policies under the October 30 rule; this candidate cannot protect unknown
  future DDL. Never grant every public table to anon/authenticated automatically.

## Failure, pause and acceptance

On candidate failure the transaction rolls back schema and ledger together.
Pause retains data, revision/ownership guards, hardened functions and RLS while
revoking seller save/submission RPCs and installing a product-write guard.
It intentionally blocks catalogue administration, moderation and image metadata
changes too, including privileged callers; buyer reads and service listings are
outside that guard. It is not a whole-database maintenance lock: inventory,
orders and Storage object bytes need their own reviewed quiescence if required.
No deletion, restore or unsafe legacy downgrade. Resumption requires
a new reviewed forward migration; regrant alone cannot remove the pause trigger.

Before any hosted action obtain: fresh authenticated Test identity and exact
ledger/schema/function/trigger/grant snapshot; genuine backup timestamp,
retention/restore procedure plus separate Storage-byte recovery evidence;
executor/role/timeout/partial-release approval; coordinated web/native v2 release
and old-session draft handling; separately scoped hosted application approval.
Production remains a separate decision.

Local application concurrency/rollback/ownership/validation, 34 focused tests,
TypeScript, Astro and Android/iOS JS evidence from `f07a23c` is reused because
application and dependency inputs are unchanged. New planner/pause tests and
actual local schema-plus-ledger results are recorded in the handover. Synthetic
fixtures do not certify hosted PostgREST bigint casts, Auth/RLS/Storage sessions,
devices/protected storage, real backups or production recovery.
