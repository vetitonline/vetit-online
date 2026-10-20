# Appointment operations development — 13 October 2026

**Local implementation prepared; final SQL validation and activation remain blocked.** No Supabase/production connection, installation, commit, push or deployment occurred. All earlier project work and commit `c8b12532dff381dfcac87a14f0013ae013b65eaf` are preserved. The Git index remains empty.

## Completed functionality

Existing booking, customer/provider cancellation, same-service rescheduling, original-price/payment preservation, FIFO offers, history, in-app notices and dated/resource-aware availability were retained. The composed marketplace SQL tests were reused through the established harness rather than replacing the booking engine.

New `appointment-operations.proposal.sql` adds:

- Idempotent private historical-hold inventory/review ledgers. Inventory is bounded to 500 new candidates per call and changes no booking or capacity. Holds with any lifecycle offer record are excluded.
- Operator-approved, versioned reconciliation policy records, disabled/unapproved by default. Provider owner/admin membership and an actual matching active booking/customer/service/time relationship are mandatory. A verified evidence digest is recorded for audit; the digest alone grants no authority.
- Reconciliation can only preserve verified capacity by changing a historical `held` slot to `booked`. It keeps booking identity, original price, text terms and payment records, records history once, and returns a stable retry result. Unknown/mismatched holds remain pending and untouched. No release, cancellation, reassignment or invented customer ownership is performed.
- Private worker settings, durable run receipts and per-provider audit rows. The service-role-only expiry worker uses business locks with `SKIP LOCKED`, existing transactional expiry/FIFO allocation, existing unique offer constraints, and isolated rollback/audit for each provider's failure. Retryable SQLSTATEs are recorded without raw database error messages.
- Worker configuration starts **disabled**. No cron, HTTP worker endpoint, credentials or external transport is installed. A later bounded-backlog receipt change (`hasMore`) prevents a busy/skipped provider from being misreported as drained.

The server-side `appointment-expiry-worker.mjs` is transport-injected and inert by default. Explicit execution has bounded batches and exponential delays. Uncertain transport retries reuse the same run ID; a durable retryable receipt uses a new run ID. Permanent failures stop for attention rather than repeat indefinitely. Audit retention, transport timeouts, telemetry and execution host are future operational decisions.

Additional safety changes:

- The lifecycle proposal now protects slots linked to active bookings even if their status is incorrectly `held`. Provider schedule controls also fail closed for holds without a live lifecycle offer; they cannot bypass historical reconciliation.
- The shared web/mobile service-discovery client rejects null/malformed service/category entries through `ServiceClientError`, preventing category rendering crashes while retaining location POST/body privacy and existing filters.

## Exact files changed in this phase

- `supabase/test-project/appointment-operations.proposal.sql` — new operations proposal.
- `supabase/test-project/appointment-lifecycle.proposal.sql` — active-booking/historical-hold schedule guards.
- `src/lib/services/appointment-expiry-worker.mjs` — new disabled server-side worker orchestration.
- `src/lib/services/service-client.js` — shared discovery response guards.
- `tests/service-client.test.mjs` — discovery regression coverage.
- `tests/appointment-lifecycle.postgres.test.mjs` — opt-in operations-test batch.
- `tests/appointment-operations.postgres.mjs` — historical ownership, idempotency, expiry failure/retry and concurrency fixtures.
- `tests/appointment-operations.test.mjs` — disabled execution, retry identity, permanent failure, busy-backlog and proposal contracts.
- `tests/appointment-historical-guards.postgres.test.mjs` — affected-only private-command/slot-guard validation with new synthetic fixtures per run.
- This report.

No native application, catalogue, seller, generated database types or prior commerce migration file was edited. No existing test data was deleted/reset. Synthetic records from unsuccessful runs remain preserved for inspection.

## Validation: passed, failed and not executed

| Check | Result |
|---|---|
| Composed marketplace + initial operations proposal | **17/17 PostgreSQL tests passed**, including 16 child cases and the parent. Baseline/seller/privacy/commerce/appointment proposals were tested together in a new D: database. New cases proved disabled defaults, private-ledger permissions, idempotent inventory, approved ownership checks, price/history preservation, transient expiry rollback/audit and concurrent FIFO reassignment without duplicate offers/notices. The new operations proposal was applied twice successfully in that synthetic database. |
| Final worker orchestration/unit/static checks | **5/5 passed** after receipt/backlog handling was updated. An earlier static assertion failure was corrected by making the conflict target explicit; the affected assertion then passed. |
| Shared service discovery | **7/7 passed**: city/postcode GET, coordinates in POST body, safe errors/null entries, valid category compatibility, bounded radius and public-location/distance handling. |
| Lifecycle proposal contracts | **11/11 passed** after slot guards were added. These are source contracts, not runtime SQL evidence. |
| Affected historical slot-guard PostgreSQL retry | **Failed**: the helper initially replaced the public wrapper instead of the private command, producing missing-rejection failures. A later query lost its PostgreSQL connection during resource exhaustion. The helper now targets the correct private function and adds new fixtures rather than resetting prior data. **The corrected retry has not run.** |
| Final SQL changes after the 17/17 run | Historical schedule guards, bounded inventory/index/approval-time refinements, and the worker `hasMore` receipt are **not fully PostgreSQL-validated in their final form**. Do not interpret the earlier 17/17 result as validation of these later edits. |
| Current mobile TypeScript attempt | **Failed from memory allocation**, not a reported TypeScript diagnostic. The prior successful mobile TypeScript result remains historical evidence; no current native build/device result is claimed. |
| Browser/native execution | Prior browser fixture rendering is reused as mocked-HTTP evidence only. Prior browser interaction timed out and the real Astro dev smoke exhausted memory. No new browser interaction or native device execution is claimed. |
| Syntax/diff/index checks | Worker JavaScript executes in focused tests; new test syntax checks and Git diff checking passed. Index empty, existing commit preserved. No full production build repeated. |

Logs:

- `D:\VetitTestTools\Postgres17\vetit_disposable_operations_20261013211147-results.txt` — successful initial 17/17 batch.
- `D:\VetitTestTools\Postgres17\appointment-historical-guards-results.txt` — unsuccessful affected retry.
- `D:\VetitTestTools\Postgres17\appointment-test-server.log` — startup, resource failure, recovery and shutdown evidence.

## Resource failure and shutdown

Concurrent TypeScript/PostgreSQL validation exhausted this laptop's available resources. PostgreSQL reported a backend exception and entered recovery; the graceful shutdown did not finish after two attempts. Only the isolated test cluster was then stopped with immediate shutdown. Database files and WAL were retained, `postmaster.pid` disappeared, and the log confirms the server is shut down. Normal crash recovery is required on its next start.

The final memory check showed **63 MiB available**, below the conservative 256 MiB gate for another sequential SQL attempt. No further server start or memory-heavy test was attempted. No Windows settings or unrelated applications were changed. Test configuration had returned worker enablement to false in the successful batch; there is no installed automatic schedule. The failed retry did not enable it.

## Web/mobile, service and historical readiness

Web lifecycle UI/API and mobile public discovery/browser handoff retain their architecture. The shared discovery guard is tested; real sign-in, booking/provider interactions and device rendering still need smoke validation in a sufficiently resourced environment. Native lifecycle screens are not implemented: mobile management uses `/appointments`. Expo 57.0.27 / React Native 0.86.0 still differs from Expo's expected 0.86.3; no dependencies were installed or changed.

Clinics and grooming can use named clinicians/rooms/groomers; daycare can use individual simultaneous places. Recurring schedules, a controlled resource directory, pooled overnight/multi-day capacity and provider timezone rules remain separately scoped product work. Existing city/postcode/radius discovery and location privacy were preserved. India/INR remains the initial flow; the public policy quote is India-specific, so coherent multi-market quoting is still future work.

The historical proposal is conservative and intentionally cannot resolve unidentified holds. Real migration readiness requires a verified inventory, resource mapping, approved policy version/evidence procedure, dependency/ledger reconciliation and review of the final SQL. No real historical records were queried. The legacy migration chain remains incompatible with the normalised model; blanket migration push is unsafe. The core lifecycle proposal is single-application; the new operations add-on is designed for idempotent reapplication but does not verify arbitrary incompatible pre-existing object definitions.

Scheduler activation is **not ready**: final receipt SQL validation, retry/timeout transport mapping, hosting, credentials, cadence, backlog monitoring and audit retention must be approved/tested first. Email/push outbox delivery, cancellation charge collection and automatic refunds remain disabled. Payment reconciliation/execution is not implemented by this worker.

## Next phase and approvals

1. Free memory or provide an adequately resourced approved local runner. Complete normal recovery of the preserved D: cluster and run only the corrected historical guard/final worker-receipt checks sequentially. This retry is already within the approved local scope; do not rerun all passing cases or reset old databases. Native/browser/full build validation remains a separate resource gate.
2. Approve the historical policy and evidence procedure before applying reconciliation anywhere outside synthetic local fixtures. Unknown holds stay untouched; resource mapping/holds need human decisions.
3. Separately approve any read-only access to the named non-production Supabase Test environment, then a reviewed targeted migration plan. Current instructions authorise no Supabase connection or remote migration.
4. Separately approve scheduler transport/hosting and activation; default-disabled SQL/JavaScript must remain disabled until then. Do not bundle external notification or payment execution with that approval.
5. Approve any dependency installation/version alignment or additional device/runner software before mobile execution. No commit, push, deploy or live-site change is authorised.

Recommended next action is to finish the narrow SQL/resource gate before proposing backend activation. Stop here for approval outside the current boundaries.
