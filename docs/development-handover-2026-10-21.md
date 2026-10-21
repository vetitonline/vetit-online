# Local development continuation — 21 October 2026

Authoritative repository: `C:\Users\DELL\vetit-online`. New local branch: `codex/development-readiness-2026-10-21`, created from `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`. The remote recovery checkpoint remains at that SHA and was not changed. Tracked tree/index were clean at entry; existing untracked correction packages, scripts, reports, CLI temp artifact and both ZIPs were left intact. No clone, branch-history rewrite, installation or recovery audit occurred.

## Changes saved locally

- Backend: `supabase/test-project/development/authenticated-profile.proposal.sql` adds least-privilege self-profile repair for existing authenticated accounts predating signup provisioning. It never derives roles from user metadata, overwrites existing profile fields or accepts a different user ID. Existing signup creation remains intact. Client invocation is deferred until separately approved hosted release/acceptance; currently calling an unapplied RPC automatically would break valid sessions.
- Grants: `data-api-grants.proposal.sql` provides an optional idempotent, fail-closed authenticated participant-read exposure assertion for future/recreated `fulfilment_events`. Existing normalized SQL already contains the grant; no broad/default/anonymous/service-table grants or RLS policies were changed. Original legacy migrations remain excluded. See the development SQL README for dependency order and limits.
- Existing variant JSONB key-count fix, guarded submission and immutable child-parent protection were reused, not recreated. New regression exercises malformed typed options, successful variant creation, direct submission bypass attempts despite action flags, proper audited submission, movement out of and into submitted listings and image reparenting.
- Website: short available featured rows now fill to four using clearly labelled, real discovery destinations (`/products`, `/services`, `/shop`), without fake seller products or masking empty/error states. Existing six discovery images were confirmed to be actual WebP assets. Shared `ProductImage.astro` now covers home, product cards/shop and details, falling back to the existing labelled category artwork after cached/network seller-photo failures without retry loops.
- Mobile: shared `ProductPhoto.tsx` is wired into catalogue cards/details. Failed images show an accessible unavailable-photo label; changed URIs remount a fresh attempt so stale errors cannot hide a new photo. No unsupported native upload, protected storage or other feature was substituted. English remains the existing default; fallback labels are supplied as component props and can use the existing locale architecture. Indian language registry, categories, location services, appointments and moderation remain unchanged.

## Executed checks

- Five new focused Node tests passed: homepage row completion/empty/error rules, six WebP assets, cached/network web fallbacks, actual native TSX error handler and URI-key/missing-photo behavior. Native handler harness is not device rendering.
- Mobile TypeScript: passed (`mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json`).
- New backend SQL: three groups passed in the retained loopback synthetic database, with both forward proposals replayed twice and all changes rolled back. Final run includes submitted listing boundaries in both directions and image reassignment denial. No hosted SQL was executed.
- Astro production compilation passed once because web components changed: server build completed in 34.19 seconds; generated local Vercel output is not a deployment. No Android/iOS exports, unchanged broad suites, installs or hosted/device tests were repeated. Previous bundle results do not validate this new native component's device behavior.
- `git diff --check` passed (normal Windows line-ending notices only).

## Checkpoint and remaining work

Changes are saved but uncommitted/unpushed on the new local branch; HEAD remains `1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759`. Separate evidence: `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\development-pass-20261021` (SQL/logs and source-hash validation receipt). The existing frozen package and earlier evidence were not rewritten.

Next safe task: finalize a reviewed, versioned local release composition that preserves the frozen corrections and appends these proposals only if approved; then wire profile initialization into the shared authenticated web/mobile path after Test has that contract and session acceptance passes. Review/render the updated pages with a controlled local catalogue fixture before visual acceptance. Missing real browser/device execution, protected storage binding, hosted Auth/PostgREST/Storage and general concurrency/idempotency remain blockers to claiming release readiness. Historical Changes-view provenance remains unresolved and does not require another recovery search here.

No push, merge, deployment, Vercel settings, hosted migrations, production configuration or live database changes occurred. Any future push may create a Vercel Preview and requires explicit approval. On iPhone return, verify the same laptop/path, development branch and worktree before editing.
