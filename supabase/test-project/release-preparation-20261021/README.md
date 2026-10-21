# Vetit Online Test release — source-ready, version generation blocked

21 October 2026. Local repository `C:\Users\DELL\vetit-online`, branch `codex/development-readiness-2026-10-21`, HEAD `5d969487f47f6c84d7404d5c0ef35c75caf7dd3f`. Original recovery checkpoints, candidate SQL and earlier work are preserved. No hosted calls were made in this preparation batch.

## Exact scope and current status

`source-ready-manifest.json` freezes the thirteen reviewed additive sources in dependency order, followed by the authenticated self-profile repair as step 14. Each source's SHA-256, prerequisites and transaction markers are recorded. No source SQL was edited. The four hosted foundation ledger entries remain preserve-only.

**There are no generated migration versions, generated migration paths or final migration payload hashes yet.** The Supabase CLI is absent from PATH, the project bin directory, the checked user tool locations and existing npm execution cache. No installation was attempted. This is a source-ready review package, not an executable/versioned release. Do not treat historical filenames in the older candidate as the new release order.

Selected core order remains: variant-key validation; booking participant RLS; commerce/fulfilment; booking transaction; appointment lifecycle; appointment operations; rejected resubmission; admin listing queue; durable moderation; automatic-approval definitions; service Storage boundaries; business-scoped moderation; price validity; then authenticated self-profile repair. Later replacements intentionally supersede earlier definitions.

The optional `development/data-api-grants.proposal.sql` assertion stays excluded: core step 3 already creates `public.fulfilment_events`, enables RLS, revokes public/anon/authenticated access and explicitly grants authenticated SELECT under participant RLS. It is the only newly declared public table across these fourteen sources. Existing foundation public tables retain their separately reviewed grants; private appointment/moderation tables require independent ACL/RLS review. No blanket anonymous/default grant is proposed.

## Fresh hosted baseline carried forward — no new query

The read-only preflight recorded in chat on 21 October at 13:23:31 UTC confirmed exact project `apfyfmokcynqiaxqvvxx`, Vetit Online Test, healthy in eu-west-1, PostgreSQL 17.11.0.003. It still had the same four foundation ledger entries, 34 public RLS tables, 192 constraints, 12 unchanged public function definitions/ACLs, 43 public and seven Storage policies, and unchanged client CRUD grants. Existing private listing-images bucket: 5 MiB, JPEG/PNG/WebP/AVIF.

Unresolved hosted defects mapped to this composition: missing JSONB key-count function (1 and final replacement 13); broad booking member reads (2/5); absent commerce and appointment contracts (3–6); older rejected/reviewed listing guards and absent admin/moderation/service-image interfaces (7–13); missing self-profile repair (14). No local proposal has been represented as hosted-installed.

## GRANT/RLS and security gates

- Public access is an explicit role/object decision, separate from RLS. Retain deliberate public discovery reads only. Seller/client writes stay behind existing ownership, trusted admin/reviewer and protected-transition controls.
- `fulfilment_events`: authenticated SELECT only, participant predicate reviewed from canonical source; no anon grant. Test cross-order/business denial later. A named/nonempty policy alone is not a semantic proof.
- Profile RPC: caller must exist in Auth, no user-ID/role input, customer role default, empty search_path, existing fields preserved, only authenticated EXECUTE. Keep web/mobile invocation deferred until hosted contract acceptance.
- Four inventory/payment tables remain client-closed. Fresh catalog found residual service_role TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges and creator-dependent defaults; this is a separate least-privilege decision, not silently added revocation SQL. BYPASSRLS does not replace SQL ACL review.
- Eight authenticated SECURITY DEFINER advisor warnings remain role-execution acceptance gates. Four no-policy notices correspond to the intentionally client-closed tables. Do not waive either category as a complete security pass.
- Preserve business legal-name column restrictions, Storage canonical paths/private bucket/update denial, admin-controlled categories, English default and extensible Indian-language architecture.
- Workers, notifications, payments, reviewer/legal-policy provisioning and automated publication remain disabled/unprovisioned. Definitions are not activation approval.

## Prerequisites before any hosted application

The catalog preflight did **not** inspect sensitive rows or certify these data-dependent conditions. Obtain approval for aggregate-only checks, with no identifiers/content returned:

1. At most one default address per profile and one null-variant cart line per cart/listing.
2. Payment rows have exactly one order/booking parent; non-null provider payment references are unique.
3. Existing order totals/components/line snapshots satisfy the proposed invariants; review NOT VALID constraint implications for historical rows.
4. No appointment slot has multiple bookings; the canonical service/start uniqueness constraint is present before resource-key replacement.
5. No overlapping future, non-cancelled provider resources after default resource assignment. Historical held-slot ownership/offers require evidence-led reconciliation; no automatic release, cancellation or invented allocation.
6. Exact schema/function/policy/index/ledger state still matches the frozen baseline when execution is requested. Stop on drift or any applied candidate; never repair ledger history to fit files.

All fourteen sources contain explicit BEGIN/COMMIT wrapper markers. Before approving an executor, review its transaction model: do not concatenate them inside a purported single atomic transaction or assume rollback across already committed steps. Any wrapper transformation changes payload bytes and requires new hashes/review. Propose bounded lock/statement timeouts, stop-on-error behavior, per-step ledger verification and a confirmed backup/restore procedure. None is approved or executed here.

## Next bounded action requiring approval

Approve a workspace-local installation of the official **Supabase CLI v2.121.0**, outside the repository, with OS/architecture and official asset checksum verification. The official release was verified at https://github.com/supabase/cli/releases/tag/v2.121.0. No global PATH/dependency/lockfile changes or login/linking are needed for local migration generation.

After installation approval: discover `--help`, `migration --help` and `migration new --help`; create a new isolated release directory; generate each selected migration sequentially using the CLI; require unique strictly increasing generated versions; copy exact frozen source bytes into those newly generated local files; verify source/payload hashes and final source-order/version mapping. Do not invent or relabel timestamps. Preserve failed/earlier preparation artifacts rather than overwriting them. Generate no executable hosted release script until transaction/backup review is complete.

Installation/generation approval does not authorize hosted migrations, database writes, accounts, credential access, commit, push or deployment. Exact package/executor/backup and bounded hosted acceptance need subsequent separate approvals.

## Verification and remaining acceptance

Executed only local source-hash/order/manifest checks and structural GRANT/RLS/transaction-marker review. Fourteen selected hashes matched; the manifest explicitly has no versions and is non-executable. These are static checks, not a new PostgreSQL replay/parser certification. Previous passing 16 continuation tests, mobile TypeScript, template compilation, four rollback SQL groups and scoped runtime/browser evidence were reused. No suites, builds, SQL or installations were run.

Still pending: real Auth/OTP/provider settings and exposed Data API configuration; hosted role/session/Storage authorization; concurrent/idempotent/retry/crash behavior; physical Android/iOS and protected storage; ordinary adapter-backed runtime/production fonts; source-to-generated-release validation once CLI generation is possible. The broad recovered historical provenance limitation remains separate from this release preparation.
