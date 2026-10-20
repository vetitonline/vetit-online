# Appointment pre-deployment validation — 13 October 2026

**Decision: ready for further local review, not deployment or migration activation.** Appointment transactions pass against the composed normalised marketplace SQL in an isolated PostgreSQL 17.11 database. Real authenticated web/native smoke validation and migration/operational reconciliation remain gates.

## A. Executed and reused validation

| Evidence | Result and scope |
|---|---|
| Expanded composed-schema PostgreSQL suite | **12/12 passed**: 11 child cases plus parent. Loads baseline, seller foundation/hardening, private-business-field proposal, commerce proposal, original booking transaction and lifecycle proposal. Includes booking/rescheduling races, cancellation/refund review, FIFO ownership/expiry, provider/customer overlap, resource conflicts/reopening, role isolation and legacy-policy preservation. |
| Historical overlap preflight | Executed during setup: synthetic overlapping future slots abort the lifecycle proposal; its resource-column DDL rolls back. Then the proposal applies to the non-overlapping fixture. |
| Supplementary PostgreSQL boundaries | All **four distinct cases passed across batched runs**: dashboard/notification ownership; stale quote rollback; seller draft creation with unpublished-product cart rejection; public INR policy with legal-name/private-ledger denial and disabled outbox. The corrected final run executed only the seller case and skipped the three previously passing cases. |
| Proposal/HTTP/source contract suite | **11/11 passed** after the SQL composition test changes. These are static contracts, not PostgreSQL execution proofs. |
| Browser fixture render | Actual appointment markup/client script rendered through the existing in-app browser against **mocked local HTTP responses**. Observed INR price, exact policy values, 14-day wording, booking history and provider selector. No real login, Astro SSR or database integration. |
| Browser interaction attempt | **Blocked** by browser automation mouse-dispatch timeout. No command was recorded by the fixture. Booking submission, cancellation/rescheduling, provider actions and responsive viewport interaction were not verified in a browser. |
| Astro dev smoke attempt | **Failed** during dependency optimisation with a memory-allocation error on the 4 GB laptop. Supabase environment variables were blanked to prevent hosted connections. The failed process exited; it was not repeatedly restarted. |
| Native mobile smoke | **Not executed**. No Android emulator/ADB found on PATH; no connected device was used. Expo CLI exists, but no bundling/device run or software installation was performed. |
| Previous validation reused | Appointment-only SQL **11/11**; focused lifecycle unit/client/contracts **28 passed**; mocked stdin runner **2 passed**; Astro check **101 files, zero errors/warnings, two hints**; later appointment Astro compilation and strict targeted scripts; mobile TypeScript; earlier availability/catalogue/service/seller checks and production build. Earlier build/type results are not proof of new SQL/runtime behaviour. |
| Current syntax/diff checks | New/changed test files parse; Git diff check passed. No full build or unnecessary unchanged application test rerun. |

Intermediate supplemental failures were **test fixture errors**, not demonstrated appointment regressions: the seller fixture omitted a required active species, then used `name` instead of the baseline's `display_name`. Both were corrected in the test file. A Node name filter unexpectedly reran other child cases and hit the already-created quote resource; the resource guard correctly rejected that duplicate. Explicit case selection now avoids repeating successful cases. Preserve the intermediate logs when evaluating this evidence.

The composed database is `vetit_disposable_marketplace_20261013200519`, in the verified D: cluster on loopback port 55432. The small local `storage.buckets`/`storage.objects`/`storage.foldername` shim is a **SQL compatibility stand-in**, not validation of Supabase Storage API delivery, platform auth/session behaviour or platform upgrades. Supabase's migration tracking was not emulated. Marketplace taxonomy fixture SQL and the incompatible legacy migration chain were not replayed; the test used purpose-built synthetic fixtures.

Logs retained on D::

- `D:\VetitTestTools\Postgres17\vetit_disposable_marketplace_20261013200519-results.txt`
- `D:\VetitTestTools\Postgres17\marketplace-boundary-results.txt`
- `D:\VetitTestTools\Postgres17\marketplace-seller-cart-results.txt` (intermediate fixture/repeat failures)
- `D:\VetitTestTools\Postgres17\marketplace-seller-cart-corrected-results.txt`

## B. Implemented versus proposed or missing

- **Local application code exists:** shared command/policy/HTTP modules; authenticated API bridge; appointment web workspace for booking, cancellation, same-service rescheduling, waiting-list join/leave and offer decisions, history, in-app notices, provider terms and dated/resource-key slots. Services/provider pages link to it. Native public availability remains shared; native lifecycle management hands off to the web account.
- **SQL proposal exists and ran only locally:** atomic booking/slot movement, provider-business serialization, unique booking/live-offer protection, policy/revision snapshots, FIFO reservations, expiry worker, owner/admin controls, private ledgers and payment review intents. It remains unapplied to any Supabase environment.
- **Initial settings:** free customer changes through the exact 24-hour cutoff, late cancellation denied by default, 15-minute offers bounded by slot start; reduced late refunds need the saved permission/disclosure terms. No cancellation charge collection, automatic refund, email/push/SMS delivery or payment gateway operation is enabled.
- **Operationally missing:** approved expiry scheduler; email/push outbox delivery; payment reconciliation/execution; full history pagination/export; recurring schedules; a controlled staff/resource registry; capacity beyond individually named places; multi-day/overnight daycare rules; native authenticated lifecycle screens.

## C. Security, historical data and migration integrity

Executed cases demonstrate owned dashboard/notice access, denial of provider controls to customers/catalogue managers, authorised provider/customer role overlap, stale-price rollback, serialised races and retained booking/payment history in the tested schema. Inspection confirms `auth.getUser()` validation, cookie-origin guard, bounded JSON, uncached responses, safe error envelopes, `textContent` rendering, private schema/table grants and empty function search paths. These are not penetration testing or a complete Supabase platform audit.

The normalised chain composes successfully. The older `20261004000000_initial_marketplace.sql` and `20261005000000_service_marketplace_foundation.sql` use incompatible legacy models; the baseline review excludes them. Do not infer that all files in `supabase/migrations` can be applied in filename order. Deployment ledger/schema reconciliation remains mandatory; no remote inventory was performed.

Synthetic legacy bookings retain their text cancellation terms and get no guessed structured policy. Customer cancellation fails closed; provider cancellation succeeds and retains history. This does not validate real historical records, payment states, orphan references, venue changes or dependencies on the uniqueness constraint being replaced. The proposal is single-application DDL, not a replayable migration.

**Conditional historical blocker:** every old slot starts with resource key `default`. Future overlaps across a business abort rather than silently allocate. Clinicians/rooms/groomers/daycare places require an approved mapping after the resource column is added and before preflight. Different spellings/case can represent different resources; no registry verifies physical identity. Existing `held` slots without lifecycle offer rows are not processed by the new expiry worker (code inspection); they require explicit hold reconciliation. Do not silently release those reservations.

Offer expiry/reassignment passed with the service-role tick invoked locally. No real scheduler is installed. Expired acceptance fails closed, but unattended releases depend on the approved worker; bounded batches must drain reliably. Failed mutation transactions roll back their expiry processing too. The per-business lock is conservative and safe for tested cases; high-volume contention, crash recovery, payment webhooks and realistic scheduler backlog were not load-tested.

In-app notices are stored and recipient-scoped; email/push outbox rows remain disabled. Late retained amounts and refunds are review intentions only. Actual payment rows stay unchanged. Payment status changes after cancellation need a reconciler before money movement is enabled.

## D. Web, mobile and service readiness

Web client/source contracts and mock rendering are positive evidence; complete signed-in SSR/API/browser integration is still unverified. Browser interaction and the real dev-server smoke were blocked as recorded above. Accessibility and narrow-screen/device review remain open.

Native compatibility is limited to the prior passing TypeScript result and source inspection. Public slot discovery uses shared contracts; booking/history use a browser handoff. Expo **57.0.27** expects React Native **0.86.3**, while the project specifies **0.86.0**. Resolve and device-test that dependency mismatch before a mobile release. No dependency was changed or installed here.

Location search retains city/postcode and distance-based discovery; no location permission was exercised. Booking eligibility checks the current venue and exceptions server-side; moving to a changed venue is rejected. Clinics and grooming can allocate clinicians/rooms/groomers via keys. Daycare supports individually named simultaneous places, not a pooled multi-day capacity model. Time display follows the user's device timezone, so provider operational timezone/DST rules require acceptance testing. Emergency/overnight/recurring services need separate product decisions rather than assumptions.

India/INR policy reads and prices passed locally. Country/market/currency fields, server-derived minor-unit prices and shared lifecycle formatters provide a foundation for expansion. The public appointment policy RPC is hardcoded to **IN**, and web/native lifecycle entry points use India defaults. Future markets need a coherent market-aware quote/terms flow and currency/timezone tests; they are not currently ready. No unnecessary expansion feature was implemented.

## E. Priorities and F. approval gates

1. **High — real integration evidence:** complete authenticated web smoke and supported mobile device testing in an adequately resourced, explicitly approved test environment. Browser rendering is not end-to-end proof. Keep production activation blocked.
2. **High, conditional on historical data — migration safety:** approve read-only inventory of the named non-production Supabase Test project's schema/migration ledger and any authorised historical-data source; then review a targeted plan for legacy resource keys/held reservations, uniqueness dependencies and saved policies. Do not use blanket `supabase db push`.
3. **High for unattended operation — expiry:** approve scheduler design/testing with service-role credentials confined to a worker, operational monitoring and bounded draining. Do not enable a public worker endpoint or notification/payment execution as part of this approval.
4. **Medium — mobile release and provider operations:** approve a focused Expo/RN alignment and device testing; approve resource naming, timezone/late-change/expired-queue rules with providers. Recurring/multi-day capacity remains separate work if required by launch scope.
5. **Medium — expansion/history:** keep initial launch India-only, recent-history limits explicit and future market/pagination work separately scoped. External delivery and financial execution require their own approvals and integration review.

Recommended next phase: complete the real web/mobile test gate and migration/resource reconciliation before approving any Test backend activation. No approval for production deployment is requested or implied by this report.

This phase changed only local test infrastructure/fixtures and this report. No application code or SQL migration/proposal was edited. Existing project work, the completed commit and previous disposable databases were preserved. No software installation, Supabase access, commits, pushes, merges or deployment occurred. PostgreSQL and the fixture web server were stopped; the failed Astro dev process exited. The Git index remains empty.
