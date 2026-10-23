# Offline Test prerequisite evidence review — 23 October 2026

`scripts/test-prerequisite-review.mjs` compares a **previously captured private metadata packet** with the pinned fourteen-step package and foundation sources. It does not obtain authenticated evidence, connect to a database, read credentials, run SQL, grant permissions or authorize execution. This prepares the next Test review without repeating the completed recovery audit or migration rehearsal.

Run locally against an approved, privately retained evidence file:

```powershell
node scripts/test-prerequisite-review.mjs <private-metadata-packet.json>
```

The report contains fixed finding codes, not supplied function bodies, identities, object paths or evidence references. Exit 1 means blocking/incomplete findings; exit 2 means structural comparisons have no blocking findings but human/hosted verification is still pending. **Neither exit code authorizes SQL.** The CLI has no apply/connection command. Inputs must be JSON metadata of at most 2 MiB; do not pass tokens or connection strings.

## Metadata contract for separately approved capture

No hosted capture was performed in this milestone. Capture must later be explicitly approved, read-only, counts/catalogs only and bound to the independently verified Test project. Do not reuse synthetic unit fixtures as real evidence. A JSON declaration cannot authenticate itself.

| Field | Required contents |
| --- | --- |
| `format` | `1` |
| `projectId` | Exact Test reference `apfyfmokcynqiaxqvvxx` |
| `provenance` | `authenticated-read-only`; an assertion requiring independent verification |
| `identity` | `independentlyReviewed: true` and a private nonempty `evidenceRef` binding the exact project and connection |
| `observedAt` | Valid UTC ISO timestamp, no more than one hour old, not in the future |
| `executorRole` | Reviewed future execution owner: `postgres` or local synthetic `vetit_test_admin`; never infer hosted identity from a local role |
| `schemaHash` | Lowercase 32-character checksum produced by the existing `schemaFingerprintSql` with `search_path=pg_catalog,public`; drift detector, not authenticity or semantic proof |
| `ledger` | Four exact foundation version/name identities, plus a contiguous prefix of 0–14 corrections. Correction rows include `statements: [original SQL]`, preserving exact bytes; keep this packet private |
| `functions` | One entry for each signature in exported `criticalFunctions`. Existing: `signature`, `bodyMd5`, `securityDefiner`, `config`, `owner`, `execute: {anon, authenticated, service_role}`. Missing: `signature`, `absent: true` |
| `tables` | Complete public-table inventory: `{name, rls, grants: {anon: [...], authenticated: [...], service_role: [...]}}`; privilege names uppercase and effective, including inherited/PUBLIC access |
| `counts` | Each exported `prerequisiteCounts` key, with a canonical nonnegative decimal **string**, preserving bigint precision |
| `backup` | Existing `requireBackup()` contract: exact project, `verified`, successful/inspected UTC timestamps, `retentionHours`, private `evidenceRef` and `restoreProcedureRef`. Metadata validity is not authenticated backup proof |

For function hashes, compute MD5 of **prosrc only**, normalizing CRLF to LF. Use `prosecdef`, `proconfig`, owner name and effective role EXECUTE checks from PostgreSQL catalogs; never use JWT user-editable metadata as authorization evidence. The source comparison covers ten explicit critical signatures, not all database functions. Every existing critical source definition requires the fixed empty search path; optional later onboarding/catalogue functions must be absent until their separately reviewed package is recorded. An unrecorded stronger installation must stop review, not be overwritten to match an older baseline.

Table inventory is derived from the hash-verified foundation and applied-prefix sources: 34 initial public tables, 35 once step 3 creates `fulfilment_events`. Extra/missing tables stop review for reconciliation; this is not a recommendation to delete tables. Client TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges are blockers. Service-role non-CRUD/RPC privileges remain explicit human review items, not automatic revocations. For `fulfilment_events`, authenticated gets exactly SELECT and anon no privileges; RLS must remain enabled. Policy expressions and participant boundaries still need separate verification—grants and enabled RLS alone do not establish correct authorization. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Aggregate keys reuse the eight already documented prerequisites: duplicate default addresses/base cart lines, invalid payment parent counts, provider-location and service-listing business mismatches, invalid price intervals, held slots and potential service-slot overlaps. Every nonzero result requires review; do not release holds, invent resources or repair data automatically. Zero counts are not a complete semantic database audit.

## Limitations and next approval

The reviewer always returns `hostedExecutionApproved: false`. It does not convert its findings into executor preflight attestations automatically. Independently authenticate capture provenance, review actual policies/default privileges/triggers and all unrecorded changes, establish genuine backup/restore/Storage recovery evidence, and then separately approve any hosted Test SQL. Physical devices, protected storage, hosted sessions and concurrency acceptance remain unverified.

Ten new focused offline tests cover every prefix, independent saved function fingerprints, malformed/stale evidence, unrecorded functions, function security/execute drift, table/RLS/grant mismatches, aggregate conflicts, backup gates and output privacy. No previous full test suite/build/recovery integrity check was repeated. App code, English-first language architecture, dependencies and frozen migrations are unchanged.
