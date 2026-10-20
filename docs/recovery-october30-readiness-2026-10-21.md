# Recovery continuation and October 30 readiness — 21 October 2026

Repository: C:\Users\DELL\vetit-online
Branch: codex/appointment-availability-contract-fixes
HEAD: 9ff89d435b18f0c4e521c6cdff8cfc2ec0b2b2f6
Local candidate: supabase/test-project/reconciled-candidate-20261020-r5
Prior checkpoint: C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\test-correction-package-20261020\checkpoint.json

## Verified preservation and smallest checks
All 21 prior receipt files matched their SHA-256 hashes BEFORE this handover update. This includes the complete candidate, new correction and validation scripts, and previous handover. All 17 foundation/additive source hashes also matched. HEAD/branch and existing untracked work match the previous state. No source reconstruction, recovery searches, builds, installs, application suites or database connections were repeated.

New static check: node scripts/check-data-api-grants.mjs — PASS. It checks the canonical 35-table inventory, explicit RLS sources, client grant/policy presence, intentional closed tables, legal-name restriction, profile column updates, absence of a blanket public-schema grant and source-manifest integrity. It is a targeted regression assertion, not a general SQL parser or final effective ACL/policy verifier. Existing local SQL/runtime evidence remains valid for unchanged payloads.

## October 30 change and access decisions
Official source: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
From October 30, newly created public tables in existing projects need explicit role grants for Data API access. Existing tables retain grants. RLS remains a separate row-access layer. Recreated tables must carry reviewed grants/policies; RLS alone does not restore access. Changes to public defaults do not justify new grants on auth/storage/private schemas.

| Surface | anon | authenticated | service_role / owner |
| --- | --- | --- | --- |
| Public taxonomy/published catalogue and eligible provider/slot reads | Explicit SELECT, with active/published/market/business predicates | Explicit SELECT; ownership/admin predicates where applicable | No new direct table grant needed by current source paths |
| Categories/species/markets administration | No client writes | Explicit DML gated by trusted app_metadata admin policies | Do not use a blanket administrative table grant |
| Profiles/businesses | Only permitted public business columns; no legal_name direct SELECT | Profile updates limited to full_name/phone; business public-column grants and scoped seller RPC for private legal_name | Existing definer RPC ownership handles scoped private reads; no service table grant inferred |
| Buyer address/cart/favourites, orders/fulfilment/history | No buyer data grants | Explicit read/write operations paired with ownership/participant policies | No new direct table access required by inspected workers |
| Listings/prices/variants/species/markets | Eligible catalogue reads only | Direct catalogue writes withheld; scoped RPCs and protected transition triggers retained | No blanket mutation grant |
| New public.fulfilment_events | No grant | Explicit SELECT already present, with customer/business-participant SELECT policy | Definer fulfilment RPC writes as its owner; no direct service-role table grant added |
| inventory_levels, inventory_movements, payments, seller_payment_accounts | Denied | Denied; no accidental grant to make features appear available | Preserve deny-by-default client boundary; service_role BYPASSRLS does not itself grant SQL privileges |
| vetit_appointments / vetit_moderation private tables | No new grants | No new grants; controlled public RPCs | Explicit EXECUTE on selected expiry/inventory/attestation/screening/automatic-approval RPCs; functions execute as owner. No new direct-table API dependency demonstrated |
| Storage | Existing private bucket policies | Canonical reserved image paths, scoped insert/delete and overwrite denial remain | No new Storage grant justified by public-table rollout |

The candidate composition has 31 public tables with explicit client table/column grants and policy sources, plus four deliberately closed tables. This does not certify every operation/policy/column combination. The only newly added public table beyond the 34-table hosted foundation is fulfilment_events and it already has its required grant/RLS/policy. Later moderation and appointment tables use private schemas. No additional idempotent migration is justified, so no SQL/payload/manifest changes were made.

Excluded legacy files: initial_marketplace creates eight tables with zero GRANT statements; service_marketplace_foundation creates eleven tables and its sole GRANT is function EXECUTE, not table access. These rely on historical defaults for table API exposure and are NOT October-30-ready as standalone provisioning paths. They also conflict with the normalized architecture and remain excluded. Do not repair them with blanket grants or replay them. New normalized creation/recreation must use the reviewed whole composition, including business privacy and seller hardening.

## Unresolved blockers only
- Missing CLI-generated release versions for steps 1–6 and 12–13, ordered executor review and independent review of the price-timing correction. Current package is local and not an executable hosted release.
- Test schema remains at the last observed four-entry foundation; recovered RPC/correction rollout has not occurred. That is the 20 October snapshot, not a fresh hosted assertion.
- Fresh approved aggregate data preconditions, recovery/backup procedure and exact Test application approval.
- Real Test Auth/PostgREST/RLS/Storage/session acceptance; device execution/protected storage; general backend concurrency/idempotency.
- Original historical Changes-view comparison-base provenance remains unresolved. Preserved file evidence does not prove inaccessible conversation history.
- Direct service-role table access and any future worker changes must declare exact privileges explicitly; current source inspection is not a live role/default-ACL certification.

## Local versus remote persistence
No commit, staging, push, fetch, merge, deployment or hosted connection occurred. HEAD is the existing local integration commit. The pinned GitHub commit 00a064b2dae94a3d1b06222db9d3cddedac89edb was integrated previously; no current remote tip was queried. Cached origin/main remains d50bf63 and is stale evidence, not live GitHub main. New package/correction/scripts/tests and existing audit reports/archives remain untracked; handover remains modified. No claim that local feature work or this report is remotely persisted.

This batch adds only scripts/check-data-api-grants.mjs and this report, and prepends the existing handover. English-default language architecture and web/mobile sources/dependencies are unchanged.

## Exact next task and approval boundary
Finalize the isolated candidate's missing release versions and executor using an available approved Supabase CLI, without changing its validated payload bytes or existing history. The previous PATH check found no CLI; installing tooling requires approval. Then obtain explicit approval for any database migration execution (including additional local execution), destructive operation, hosted Test application, remote push, production change or deployment. No such operation was initiated. After approved Test application, prioritize the coordinated seller create/edit/reject/resubmit and provider schedule/policy session/Storage acceptance runbook before new features.

