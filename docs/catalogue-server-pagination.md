# Bounded public catalogue reader — development candidate

Website `/products`, product detail and `/shop` listing routes share `readPublicCatalog` with the native `/api/catalog` client. They now call `read_public_catalogue_page` rather than loading and filtering the first 1,000 listings in application memory. API v1, filters, category descendants, page numbers, exact totals and image fallback contracts remain intact. No fixture fallback ships in the application.

## Implementation and security

- The database filters published, non-archived products from active verified businesses, active product categories and available/compliant IN listings in an active market. Caller RLS remains an additional restriction, even when authenticated sellers can read their own drafts through other interfaces.
- Literal case-insensitive substring search covers title, description, category and seller. `%` and `_` remain literal characters; regional scripts are accepted without an English-only text-search dictionary. PostgreSQL case folding/collation can differ from JavaScript locale behavior. Name ordering uses deterministic lowercase C collation, with UUID tie-breaking for all sorts.
- Listing species take precedence; active category species are the fallback only when no active listing species are visible. The application still resolves descendant category IDs and validates species/category navigation before RPC execution.
- Current base prices take precedence over variant prices. Otherwise choose the cheapest latest effective price per active variant; expired/future/inactive or wrong-currency prices do not participate. Unpriced products remain visible without price bounds and sort last for either price direction.
- Counts and page selection share one SQL statement/snapshot. Returned rows are bounded to 48, including out-of-range page clamping and empty-result metadata. Images are selected only for the page; caller-bound Storage signing is limited to those rows. Private fields and raw image paths are not forwarded by the application adapter.
- The function is `STABLE SECURITY INVOKER`, with an empty search path, qualified relations and `row_security=on`. PUBLIC/service-role execution is revoked; only anon/authenticated receive explicit EXECUTE. No new table or broad SELECT grant, policy replacement, write capability, service key or auth shortcut is introduced. Existing table SELECT privileges and enabled RLS are migration prerequisites. This explicitly handles function access rather than relying on default grants around the 30 October Data API change.
- RPC/permission/schema failures return unavailable (503), not a successful partial catalogue or a retry of the old capped scan. Storage failures retain the existing product placeholder.

## Approval-gated Test activation

Candidate: `supabase/migrations/20261024134913_public_catalogue_page.sql`, generated using the existing official local Supabase CLI. It is **not hosted-applied** and is **not part of the frozen recovery release**. Do not change frozen payloads/manifests to include it implicitly.

1. Obtain separate approval for hosted Test preflight and activation. Independently verify Test identity, authenticated database/Storage backup evidence, reviewed migration ledger and existing public SELECT policies/grants for the eleven referenced tables. Preserve all stronger onboarding, moderation, revision and child-record protections.
2. Confirm the recovered marketplace schema and approved correction chain are installed. This additive reader has no new dependency on the seller-save RPC bodies, but those security prerequisites must not be rolled back. Fresh databases need the reviewed Test schema/corrections; do not replay the incompatible historical production migration chain blindly.
3. Review indexes/lock time against actual Test size. This candidate creates two partial listing indexes in its transaction; ordinary index creation can block writes. Large live environments need a separately reviewed concurrent-index plan/maintenance window. No index operation has been run against hosted data.
4. Apply this candidate only after explicit owner approval, through the reviewed executor/ledger workflow. Verify anon/authenticated reads, direct RPC bounds, real RLS, current prices and Storage behavior. The local synthetic suite does not certify hosted policies, session identity or object-byte recovery.
5. Activate matching application code only after that acceptance. A Preview running this code against an older configured database can return 503 until the new RPC exists. No production deployment or environment-variable change is authorized by this package.

Pause/reversal: leave the additive function/indexes in place and coordinate an application rollback to the preceding checkpoint if necessary. Revoking the new function's EXECUTE is a separate approved hosted action requiring application coordination. Never restore weaker legacy RLS, remove security migrations or reverse seller data as a rollback technique.

## Validation and remaining limits

`tests/catalogue-page.postgres.mjs --run-local` runs only with the explicit local psql binary, fixed synthetic user and loopback port 55439; it refuses a database containing existing tables. It uses the recovered baseline table definitions, synthetic permissive/read-denying policies and 2,505 synthetic products. Six SQL groups cover migration guards/idempotence/ACLs, pagination, eligibility/RLS, literal/regional search, prices/species/images and invalid direct calls. It does not replay or certify the full hosted policy chain.

`tests/catalogue-page.test.mjs` checks the actual TypeScript RPC adapter, arguments, bounded signing, malformed responses, missing RPC/denied grants and empty/clamped pages. Existing SSR/API/native integration and shop tests use a synthetic paginated adapter to verify the unchanged transport/navigation contract.

The transfer and signing work are bounded; **database work is not constant-time**. Exact counts, effective-price resolution, literal substring search and deep OFFSET pages can scan/sort many eligible rows. The existing API bounds page numbers to 10,000 and page size to 48; page counts can exceed that navigable window on very large catalogues. This increment removes the 1,000-listing scan, not every large-catalogue performance limit. Before high-volume launch, benchmark real Test plans/RLS at representative scale and decide on a backward-compatible cursor/search-index extension (which requires separate schema/contract review). No pg_trgm extension, materialized cache or new dependency was installed.

Real browser/device, hosted sessions, protected storage, concurrent publishing between separate page requests and production-load acceptance remain unverified. Stable ordering prevents ties from randomly moving rows, but page-number pagination does not guarantee a multi-request snapshot when listings change between requests.
