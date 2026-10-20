## Draft recovery and extensible locale follow-up — 19 October 2026

Preserved the prior nine-file checkpoint. Seller draft JSON responses now distinguish rejected validation (422), unique conflict (409) and uncertain save outcome (503). The form locks duplicate/uncertain submissions, retains confirmed draft IDs and offers draft inspection when uploads fail. It no longer automatically deletes objects/reservations after an ambiguous upload response; owner-authorised inspection/recovery is required. No stored object or record was changed by this local batch.

English remains the default. A shared registry covers English plus the 22 scheduled-language codes with explicit additional-locale extension points, region/script resolution and content-language/direction metadata. Existing English/Hindi messages are reused; unreviewed languages fall back to English/LTR rather than masquerading as translated content. Shared buyer/mobile copy, currency/status helpers and order links now handle reviewed regional tags consistently. New translations, fonts/RTL/device QA and language-specific moderation coverage still require review; the registry does not certify those capabilities.

Eight new targeted tests and two directly affected existing checks passed. The changed product API and mobile contracts type-check; two changed Astro sources compiled. Offline component/route fixtures are synthetic, not browser/Storage/device certification. Original SQL guards and their prior evidence remain unchanged; no browser/OS/auth blocked commands, hosted operations, dependencies or migrations were attempted.

## India-first seller validation follow-up — 19 October 2026

Preserved the seven-file moderation/component checkpoint. Shared seller validation now accepts Hindi-only names using deterministic ASCII URL identifiers compatible with existing SQL, trims trailing slug delimiters, rejects malformed UUIDs/ambiguous scalar fields/file-valued inputs, and validates optional phone formatting and credential-free HTTP(S) website URLs. Titles remain unchanged; URL identifiers are not security hashes and existing DB uniqueness still governs collisions.

Business/product routes reject malformed or duplicate identifiers before business queries, keep membership/edit/verification restrictions, use existing validated draft/create operations and hide raw caught diagnostics. Onboarding/product hints are bilingual. Mobile seller creation still uses the existing explicit Test web handoff; native moderation/auth code is unchanged.

Eight new validation/actual-route tests and seven directly affected existing tests passed. Both changed APIs passed focused TypeScript using existing bundled typings; two changed Astro sources compiled. No new SQL, provider, dependencies or hosted calls were introduced. Prior SQL/moderation/native evidence is reused; browser EPERM and OS/auth/device acceptance blockers were not retried.

## Component compatibility and validation follow-up — 19 October 2026

Reviewed the preceding ten-file adapter/tooling batch and reused its passing SDK, API typing and SQL evidence. Fixed native sign-in handler re-entry before React state commits, avoided a new verification request after detached UI completes OTP, and coalesced concurrent read-only workspace refreshes so native effect replay does not leave a false conflict. Mutation locking, identity checks, reviewer authority and publication restrictions remain intact.

Six new tests and three directly affected existing workspace tests pass. The new harness executes actual TSX hook/event logic offline with synthetic React/native primitives; it is not a renderer or device/layout/accessibility acceptance claim. It covers duplicate taps, unmount completion, Hindi sanitised errors, masked OTP input, effect replay, automatic approval status, reviewer-only flagged controls and identity changes during shared reads. Mobile TypeScript passes. Existing browser spawn EPERM and physical OS/module/device blockers were not retried or relabelled as code failures. No dependencies, hosted systems, migrations or credentials changed.

## Secure native adapter and local tooling follow-up — 19 October 2026

The API typings blocker is resolved using the existing bundled Node typings. `node scripts/check-moderation-api.mjs` runs the focused compiler in-process without dependency installation, child spawning or tsconfig changes. The standalone session API and changed native types pass.

Prepared a gated, OS-storage-injected Test auth adapter, composition with the native moderation host, transient bilingual email-code UI and device-scoped sign-out. Existing-user OTP only; no signup, arbitrary redirects, URL token ingestion, insecure storage fallback, real credentials or automatic activation. Identity remains verified by the server. Timeout/sign-out/disposal prevents late local token reuse. Approved secure-storage/crypto bindings and real Test authentication acceptance remain required.

Eight new adapter tests pass with synthetic SDK/storage; previous passing integration and SQL evidence is reused. One fresh bounded sandboxed Edge probe confirmed spawn EPERM: browser acceptance remains skipped/unverified, with no sandbox weakening or repeated retries. Native TypeScript and the focused API check pass. Test harness import-resolution issues were corrected without changing app module/tsconfig settings. No hosted calls, providers, SQL, deployments or credentials were changed.

## Native verified session and queue follow-up — 19 October 2026

The account tab now supports a native moderation host: verified identity endpoint, bounded/deduplicated in-memory session bridge, background cancellation, paginated reviewer queue, case selection/back navigation and existing seller/reviewer detail operations. Tokens come only from an injected approved secure auth adapter, remain out of subscriber snapshots/URLs and are verified through the existing server authentication helper. Reviewer hints are not permissions. Actual logout/revocation remains the platform auth owner's responsibility; background clearing is local only.

Shared triage keeps successful automatic approvals out of manual review UI. Pending screening stays pending; flagged/uncertain and policy-manual screened cases require authorised review. Automatic approval/publication controls remain disabled; no original SQL candidate was changed. Queue DTO/cursor validation is shared with web/server reads. Admin case navigation returns to the durable moderation queue.

Eleven new targeted tests and one directly affected existing queue test passed, including bounded loopback verification/queue with actual route source and synthetic auth/RPC. One initial test fixture raced its own setup; its explicit readiness wait fixes that test, which now passes. Mobile TypeScript and the changed Astro component compiled. Real browser execution remains blocked by the previously identified process-permission restriction; Android SDK tools are absent from PATH and the standard SDK location. Native auth bootstrap/secure storage, crypto UUID source, device rendering and real hosted Test acceptance remain external dependencies. No provider, database, hosted auth or deployment changes were made.

## Identity, screening and approval-candidate follow-up — 19 October 2026

Shared workspaces now bind snapshots and decisions to a verified `userId`, check identity again after responses, tolerate token refresh for the same user and clear private state if identity changes. Native hosts must supply `sessionUserId` alongside a verified session getter and platform UUID generator; changing that identity immediately changes the screen workspace. Neither these values nor reviewer presentation flags grant server permission.

The trusted worker accepts optional policy-version-bound text rules as a veto before full content providers. Suspicious/restricted matches record uncertain evidence, prohibited matches fail, and unknown/mismatched rule configuration records unavailable. Clean rules alone cannot pass screening. Evidence uses existing immutable attestations; an authorised reviewer must explicitly escalate through the guarded decision operation. No policy vocabulary or live provider was activated.

Offline preparation/verification scripts assemble the reviewed 11-step SQL candidate with exact source bytes and separate historical prerequisites. No executor, ledger repair or operational seed is supplied. Policy/reviewer configuration remains unapproved: existing reviewer access is global across Test businesses, so its scope needs explicit approval. Ten new tests and seven directly affected existing workspace tests passed, as did mobile TypeScript and candidate checksums. No SQL or hosted access occurred. Prior audit/RLS/concurrency and browser-restriction evidence is reused.

## Session integration follow-up — 19 October 2026

Native moderation now has a bilingual screen mounted through an optional trusted session-host integration in `mobile/App.tsx`. The default Expo preview still uses the web sign-in handoff. The shared session workspace loads status, validates correction/resubmission and review commands, keeps retry idempotency, blocks concurrent/stale decisions, clears private data after authentication/permission failures and requires refresh after accepted mutations. The native screen ignores old subject/session-host responses; reviewer UI flags confer no API authority. A native sign-in/session source and device runtime acceptance remain required.

The server worker now excludes seller applications, non-ordinary classifications and credential-requiring/unknown contexts before requesting automatic decisions; empty image sets fail closed. A bounded, sequential server batch accepts at most ten unique cases, sanitises failures and continues independent cases without retries. No scheduler or provider is enabled. Seller form submission rejects malformed/duplicate identifiers and malformed form parsing while preserving existing atomic moderation submission and security checks. Web review actions lock after permission revocation.

New validation: 17 new targeted checks and two directly affected existing worker tests passed; changed Astro component compiled with the installed compiler; mobile TypeScript passed. Existing SQL, browser-launch restriction, provider and hosted acceptance evidence is unchanged. No SQL was run, migrations changed or automation activated in this follow-up. Hosted approval gates below still apply.

## Automatic approval and Storage follow-up — 19 October 2026

This checkpoint supersedes the historical unfinished list below. Step 10 adds audited, revision-bound, service-role-only automatic approval for explicitly permitted ordinary product/service policies with all fresh mandatory evidence. Defaults remain disabled. Uncertain, prohibited, live-animal, veterinary and regulated submissions cannot auto-approve. Automatic approval never publishes: listings stay submitted and existing manual publication gates remain intact.

Step 11 corrects restrictive Storage boundaries for reserved service images and replaces inline membership read predicates with a narrow security-definer boolean helper. Anonymous membership access remains denied; overwrite prohibition is unchanged. Both additions are installed only in the identified disposable local database. Source checksums and validation are recorded in `supabase/test-project/release-corrections/automatic-moderation-release.json`; original migrations remain unchanged.

Worker provider cancellation, retry-stable review idempotency, expired-session/conflict states, seller automatic-decision status, admin queue indicators and a typed native adapter are implemented. Mobile has a bilingual Test-only seller web handoff; native authentication and review screens remain pending.

Validation: 28 new Node checks, two affected existing provider tests, three rollback-only automatic SQL groups, one real Storage RLS rollback group, two changed Astro components and targeted/mobile TypeScript passed. Prior checkpoint evidence is reused. Actual browser launch was denied by local process permissions; offline DOM/loopback HTTP checks are not browser acceptance. Real provider, Storage HTTP/JWT and device acceptance remain unverified. No operational policies/providers are seeded; automation controls remain false.

Before hosted Test changes: approve the exact ordered/checksummed steps 1–11 and ledger reconciliation; approve legal/category policy and reviewer provisioning; approve providers/data sharing and server-side secret configuration; approve bounded synthetic hosted runtime acceptance. Enabling Test automatic approval needs separate explicit approval after acceptance. Production automation/publication and any deployment, commit or push remain unapproved.

---
# Local moderation foundation — 19 October 2026

## Current enforcement checkpoint

The foundation below is historical. Supplemental migration `20261019102037_vetit_durable_moderation.sql` now adds private durable cases, immutable evidence/events/policies, current reviewer grants, server-only attestations, revision-bound screening, atomic/versioned/idempotent decisions and gates on legacy review entry points. It is installed **only** in the identified disposable local database. Hosted Test remains unchanged.

Web case queue, decision panel and seller history use `/api/moderation`; the shared transport supports explicit Test origins and bearer authentication for future native screens. Seller/product/service correction and review operations are prepared. Validated service draft/image reservation RPCs extend the original guard only for scoped service draft insertion; other guard branches remain unchanged.

Policies and reviewer grants are not seeded by the migration. Only labelled synthetic local acceptance configuration exists. The dormant server worker requires trusted adapters with explicit evidence validity; missing adapters record unavailable, and cannot approve. Actual image-byte/legal/credential adapters, approved operational policies, native screens and hosted runtime acceptance remain unfinished. The older six-file executor does not contain steps 7-9. A reviewed, checksummed release candidate and explicit owner approval are required before any hosted mutation.

Validated: 16 new offline enforcement/worker tests, five main rollback-only SQL groups, installed worker-context and cross-submission history groups, real two-session conflict, committed audit durability and duplicate replay. The local synthetic concurrency applicant and private records are retained; other new fixture rows rolled back. No production, deployment, Git commit/push, credential change, reset or deletion occurred.

## Historical foundation scope

## Implemented scope

`src/lib/moderation/policy.js` and its declarations are shared web/mobile contracts, not publication authority. Seller validation reuses existing business validation; authoritative duplicate/category evidence is mandatory. The assessment evaluates revision-bound evidence, market/currency/price, classification, mandatory checks, images and configured automation policy. Configurable text phrase rules support English/Hindi normalization. They are a deterministic signal, not comprehensive legal/content screening. No real prohibited-item vocabulary has been approved or installed.

Default India policy disables automation. With synthetic complete evidence and an explicit permitting policy, ordinary categories can return **eligible**. All outcomes retain `canPublish: false`. Regulated/veterinary/live-animal cases always require human review. Prohibited evidence returns blocked; uncertainty, missing checks, stale revisions and unscreened images return review. Provider adapter is unconfigured by default and fails closed; raw provider diagnostics are discarded. A future network adapter must additionally implement request cancellation, data-sharing approval and bounded provider resource use.

The read-only admin queue uses a trusted `getUser()` result and a second database check of `app_metadata.vetit_admin`. Business admins/support have no new privileges. Queue API: `GET /api/admin/review-queue`, version 1; browser cookie and existing native bearer authentication are supported. Both API and SSR page use private/no-store responses. Filters: status, kind, market, category; cursor: `before` plus `id`. Fixed API page size 25; DB maximum 50. Risk is explicitly `not_assessed`; unsupported risk filters fail. No empty-success fallback on missing RPC. No contact/identity documents are returned. Stable created-at/id keyset pagination avoids offset scans; publication/status changes between pages can still change the live result set.

Web `/admin/review` provides responsive listing cards, filters, empty/unavailable/denied states and next-page navigation. Seller dashboard reuses a bilingual status component and the existing resubmission model. Native mobile screens are not wired; the shared policy/queue declarations and bearer-capable endpoint are prepared only.

## Migration dependency

CLI-generated supplemental Test migration **20261019100841_vetit_admin_listing_queue.sql**, intended candidate step 8 after the six original corrections and step-7 rejected-resubmission guard. Definition-idempotent, read-only stable SECURITY DEFINER, empty search_path, explicit admin check, anonymous/PUBLIC execution revoked, authenticated execution granted. Existing RLS, write grants, triggers and review functions are unchanged. No risk table, personal-data table or fixture seed is added. The earlier candidate/guarded executor does not include this file: do not use blanket db push or claim release reconciliation is complete.

## Explicitly unfinished; required before automated publication

1. Persist server-owned policy versions, category regulatory classification and revision-bound screening attestations. Authoritative duplicate search must not use only client-supplied flags. Bind image evidence to immutable object hashes/version; invalidate after image/content changes.
2. Add a server coordinator that loads those records, calls mandatory providers, and records explainable decisions atomically. No endpoint accepts advisory client assessments now.
3. Enforce required text/image/credential evidence in **every** publication route, including the existing manual review RPC. Current manual review checks ownership/storage existence, not content-screening completion; this batch has not solved that publication gap. Do not enable automation or treat queue visibility as publication readiness.
4. Add append-only decision history/notes, request-corrections/escalation/appeals, idempotency keys and revision-aware row locks. Integrate product/seller transitions and implement separate validated service transitions. Concurrency/write-operation acceptance remains untested because these operations have not been implemented.
5. Add seller-visible persisted reasons, trusted support permissions with explicit scope, risk filtering, onboarding queue and native mobile screens. A seller's existing rejected-listing correction/resubmission path remains intact.
6. Approve policy/legal category rules and any external content data sharing. After local security acceptance, explicitly approve the exact ordered/checksummed Test candidate and bounded synthetic hosted acceptance. No hosted change is currently authorized.

Next milestone: durable evidence + audited, idempotent decision coordinator + publication guard; then write-enabled review UI and native seller status integration. No production/deployment approval is implied.
