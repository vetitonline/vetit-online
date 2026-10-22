# Catalogue edit conflict protection — bounded approval plan

Status: **required migration/contract correction; not implemented, installed or accepted**. Original repository/development branch is preserved. No frozen release, historical SQL, runtime API, RLS or dependency is changed by this plan.

## Confirmed gap and compatibility boundary

- `src/lib/seller/catalogue.js:44` compares `expectedUpdatedAt` using a SELECT, then later invokes the nine-argument `save_seller_product` without the expected value. Two requests can pass before either saves. The parent row lock in the SQL serializes writes but does not reject the stale writer.
- `src/pages/api/seller/product.ts` also invokes that legacy RPC; its existing multipart edit form has no version precondition. Protecting only the JSON/mobile path leaves this writer uncovered.
- Authenticated direct RPC access remains another writer. A new guarded RPC alone does not protect legacy calls. Direct allowed-column/child mutations and submission must be inventoried before claiming whole-catalogue protection; preserve existing moderation and child-parent guards.
- `public.set_updated_at()` assigns transaction-start `now()`. A timestamp is not a guaranteed monotonic edit revision; transactions can share a timestamp or commit in a different order. JavaScript timestamp parsing can also lose PostgreSQL microseconds. Do not claim timestamp comparison is a complete revision protocol.
- Shared/native transport is currently API version 1 and uses `expectedUpdatedAt`. Existing native sessions must not silently lose drafts or be treated as successfully saved when the server rejects an old contract. Unknown outcomes remain unconfirmed, with explicit refresh/review and no automatic retry.

New evidence: `catalogue-race-diagnostic.mjs` and `catalogue-race-result.json` in the separate `catalogue-concurrency-20261022` evidence folder. The actual application module accepted two overlapping synthetic requests with the same pre-read timestamp; it rejected the subsequent stale sequential request with 409. This is an application diagnostic, not SQL concurrency acceptance. Previously passing tests are reused, not misrepresented as atomic protection.

## Proposed forward-only package, in dependency order

1. Pin the reviewed installed prerequisite function definitions, ledger, grants and trigger signatures. Compose **after** the frozen release and stronger onboarding/security corrections; never replay old save functions or restore weaker policies. Generate an additive migration with the existing verified CLI only when preparing the approved package. Do not invent a migration version, edit a frozen manifest or apply historical exports.
2. Add a server-owned `catalogue_revision bigint not null default 1` on `public.listings`, with positive/overflow guards. Treat revision as an opaque decimal string in JSON so JavaScript cannot truncate bigint values. Preserve UUID creation and existing fields. No public table is created, so the October 30 explicit Data API table-grant rule creates no reason for broad new table grants.
3. Prepare a separately named `save_seller_product_v2` with the existing payload plus mandatory expected revision for edits. Creation requires no existing listing/revision; reject contradictory creation/edit inputs. Return a versioned receipt containing the exact listing ID and resulting revision, read inside the same transaction. Do not add an optional overload/default that allows PostgREST ambiguity or an unguarded fallback.
4. Resolve `auth.uid()` from actual authentication and retain all existing active business, active owner/admin/catalog_manager membership, product kind, unarchived draft/rejected, category/species, typed JSONB, price-history, blocked-owner and moderation guards. Mirror the existing business/membership/parent lock order. Recheck authorization and expected revision **after the relevant locks**, before any listing/child writes. Return a stable conflict SQLSTATE (for example PT409) that both APIs map to a generic no-store HTTP 409, with no private row data. Never catch a conflict and retry automatically.
5. Lock the listing and compare the revision in the same database transaction as all writes. Reuse the hardened save implementation through a private checked helper or reviewed delegation; do not duplicate an obsolete nine-argument function body. Advance revision with checked bigint arithmetic under that lock. The receipt must reflect the final revision after child writes. Failure at any stage rolls back parent, variants, species, prices, revision and ledger together.
6. Define coverage for every editable child (variants/prices/species, and images where they affect the reviewed aggregate) and submission transitions. Child changes must acquire the parent lock and invalidate the aggregate revision without weakening immutable-parent/review-state guards. Review parent-before-child lock ordering to avoid deadlocks; accept monotonic multi-increments if multiple triggers fire rather than promising exactly one increment prematurely. The loader must return a coherent aggregate and revision: a single snapshot RPC or verified before/after revision reads with fail-closed handling, not old fields paired with a new token.
7. Explicitly revoke new RPC EXECUTE from PUBLIC/anon/service_role; grant only authenticated after verifying the owner/security-definer boundary and empty search path. Keep private helpers inaccessible to client roles. Review table-level versus column-level privileges: a column REVOKE does not negate a table-level UPDATE grant. Clients must not set/reset the revision or bypass the checked write path. Preserve anonymous published reads where already intended, owner scope, admin boundaries and all RLS policies. Do not add blanket/default/schema grants or disable RLS. Independently review any service/admin writer that intentionally bypasses client revision checks.
8. Prepare compatible server/web/native contract support together, including multipart hidden revision, JSON opaque revision validation, coherent catalogue load, receipt validation, conflict UI and draft preservation. Keep English defaults and regional text unchanged. Retain API v1/create compatibility until an explicitly reviewed cutover. **Legacy edits cannot remain unrestricted while claiming complete protection.** Choose owner-approved deprecation/denial of legacy edits after clients are ready, or a reviewed legacy precondition transport; never obtain a fresh revision on the client's behalf and silently overwrite stale data.
9. Prepare the exact versioned Test package and atomic schema-plus-ledger executor plan, hashes, expected predecessor ledger, backup/restore prerequisites and partial-release recovery. Stop on drift/partial application. A security-preserving pause may disable writes; it must not remove guards or reinstate unsafe legacy behavior. No destructive rollback or data restore is part of this package.

## Required focused acceptance — all pending

| Scenario | Required assertion |
| --- | --- |
| Same revision, two real PostgreSQL sessions | First commits; second waits then conflicts; no lost update or second set of child writes |
| First writer rolls back | Waiting writer with original revision may succeed; failed writer leaves no price/child/revision changes |
| Older transaction starts first but saves later | Revision still increases; wall-clock/transaction timestamps do not permit stale overwrite |
| Sequential retry, missing/stale/malformed/overflow revision | Conflict or input rejection before mutation; no automatic retries or duplicate draft creation |
| Foreign owner, buyer, viewer, anon/service-role direct RPC | Denied without revealing another seller's revision/content; no writes |
| Membership revoked/business blocked during wait | Rechecked authorization denies the waiting writer; no privilege escalation |
| Submitted/published/archived/service listing | Denied; existing review and admin boundaries retained |
| Valid and invalid typed variants/species/category/prices | Hardened validation preserved; transaction rollback covers each failure |
| Child-only edit versus save/submission/image mutation | Parent version invalidates stale aggregate; stable lock ordering or safe rollback on deadlock |
| Legacy RPC, direct table and child-table writes | Every claimed protected writer is gated or explicitly unsupported; no bypass by revision-column update |
| Shared JSON, web multipart and mobile cached draft | Matching opaque revision contract; coherent readback; 409 preserves fields/images and requires review |
| Lost network acknowledgment | Unconfirmed state preserved; no success assumption or duplicate save |
| ACL/RLS and October 30 grants | No PUBLIC/anon EXECUTE, no new broad table grants, correct role/owner scope and private helpers |
| Replay, failure, partial ledger, migration pause | Idempotent reviewed DDL, exact ledger atomicity, no weakened security or historical payload rewrite |

Use a new explicitly named disposable **local synthetic** database, fixed loopback binding, retained fixtures and the existing private credential-file convention. No production/Test dump is needed for these tests. Do not restore/drop existing databases. Local tests do not certify hosted Auth/PostgREST, real-session, device or protected-storage acceptance. Run only the affected contract/security tests; rebuild web/mobile only after runtime or dependency inputs change.

## Approval and execution boundary

Local design and test preparation may continue under existing authorization. Completing end-to-end protection requires a coordinated migration/API cutover decision and, later, **separate explicit approval for the exact hosted Test package** after authentic backup evidence and read-only prerequisite reconciliation. Production application is a different approval. No hosted SQL, grants, restore, deploy or configuration changes are approved by this document. Do not activate an unavailable RPC in current clients.

Database locking basis: [PostgreSQL row-level locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS). A row lock serializes access; the application-specific expected revision must still be checked under the lock.
