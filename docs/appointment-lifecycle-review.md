# Appointment lifecycle implementation and approval boundaries

This work is local and uncommitted, built on commit `c8b12532dff381dfcac87a14f0013ae013b65eaf`. Existing catalogue/mobile work is preserved. No database was contacted, no migration applied, and no notification or payment sent.

## Existing foundation and dependencies

- Public availability: `GET /api/services/slots`, shared web/native client, bounded 14-day default query. This implementation is preserved.
- Booking: existing authenticated `POST /api/buyer/appointments`, same-origin cookies or verified bearer authentication, and the unapplied `20261009110000_vetit_service_booking_transaction.sql` proposal. Price and service identity are resolved by the database.
- Baseline schema: service offerings, availability rules/exceptions, appointment slots, bookings, payments, provider locations and business memberships already exist in the documented Test baseline. Generated database types continue to represent the applied schema only.
- Test migration history differs from repository filenames. The existing documented migration reconciliation requirement remains; do not use a blanket `supabase db push`.
- Mobile: native public browsing and availability, browser handoff for authentication. No new token storage, native OTP, location module or direct Supabase access was added. The shared lifecycle HTTP client supports bearer sessions for a future native authentication integration.

## Local functionality prepared

`/appointments` provides booking requests, customer cancellation/rescheduling, waiting-list join/leave, offer accept/decline, recent history, in-app notifications, and provider schedule management. Service and provider pages link to it. Mobile service cards and the account tab hand off to the same page.

The shared modules normalize commands and policy previews; the authenticated `/api/appointments` API verifies sessions, guards cookie mutations against CSRF, bounds JSON bodies, uses uncached responses and hides database error details. A public read exposes only a published, verified service's terms and current India-market price. Missing proposal RPCs fail closed: controls remain unavailable rather than pretending a booking exists.

The new proposal `supabase/test-project/appointment-lifecycle.proposal.sql` stays outside normal migrations. It:

- Reuses the existing booking transaction privately and retains its public UUID-returning entry point through a lifecycle wrapper.
- Serializes lifecycle/schedule writes on the provider business row, retains the unique booking-slot constraint, and checks shared-resource time overlaps before publishing/reopening slots.
- Releases a cancelled booking's slot reference while preserving slot identity/dates in immutable event history. Rescheduling retains the booking ID, agreed price/currency, policy and payment links; the target must be an available slot of the same service. A failed move rolls back both allocations.
- Reserves cancelled customer slots for eligible waiting customers in deterministic FIFO order. One live offer per slot and entry is enforced by unique indexes. Acceptance checks ownership, deadline, availability, terms and server-derived price. Price changes require refreshing rather than silent repricing.
- Snapshots terms for bookings and offers. New-booking clients send expected terms/price to detect stale quotes. Provider changes affect new bookings/offers only. UI mutations send booking revisions so concurrent stale edits require refresh; legacy callers without revisions still receive transactional allocation/ownership checks. Cancellation and rescheduling retries are safe; clients do not automatically retry writes. Moving to a different service location is rejected rather than silently changing the agreed venue.
- Restricts schedule/policy/confirmation/completion to active business owners/admins. Customer actions are tied to `auth.uid()`, not caller-supplied profile or provider IDs. Only the customer can reschedule. Existing booking read access is narrowed so catalogue/fulfilment roles cannot read appointment customer details.
- Stores event history, recipient-owned in-app notifications, and deduplicated **disabled** email/push outbox rows. Private ledgers have RLS and no authenticated direct-write grants. Only guarded public RPCs are executable.
- Creates refund/void **review requests** from actual payment rows and saved policy. It never changes a captured payment to refunded or invokes a payment provider. Pending/mixed payment states require review. Cancellation preserves payment records even when the booking slot is released.

## Approved initial settings

For each appointment-enabled service, the initial provider-specific terms are:

| Setting | Initial value |
|---|---|
| Customer cancellation and rescheduling | Allowed until 24 hours before start, including the exact cutoff |
| Cancellation inside the cutoff | Not allowed by default |
| Timely refundable captured amount | 100%, queued for review; no automatic refund |
| Waiting-list offer expiry | 15 minutes, or slot start if earlier |
| External notification delivery | Disabled |

Late cancellation charges additionally require an explicit permission flag and a disclosure of at least 10 characters (maximum 500), displayed before booking and offer acceptance. Allowing late cancellation with less than a 100% refund without both is rejected. Proposed retained amounts are recorded for review; no cancellation charge is collected and no refund is issued. Permission/disclosure fields are configuration, not a determination that any particular charge is legally permissible; that decision belongs to the provider's approved terms before financial execution is enabled.

Owners/admins can configure individual services. Historical bookings without a structured snapshot require provider-assisted cancellation; customers cannot infer new terms retrospectively. Provider cancellation withdraws its slot rather than offering capacity the provider has removed, and queues any captured amount for full refund review. Customer cancellation/rescheduling frees capacity for waiting customers.

## Required approval and outstanding work

1. **Database review and execution tests:** the proposal has not been applied anywhere. Verify prerequisites and historical overlapping resources in a disposable environment before considering application to the named Test project. The proposal refuses overlapping future legacy slots; a separately reviewed mapping/backfill must be added after creating the resource column and before the overlap preflight if such data exists. Do not guess mappings or pre-alter Test/production. The canonical service/start unique constraint is replaced by service/resource/start uniqueness so separate clinicians/daycare places can share a start; unexpected dependencies abort rather than being removed with CASCADE. The per-slot booking unique index remains intact. This is intentionally single-application DDL, not a script to replay.
2. **Real concurrency/RLS tests:** `tests/appointment-lifecycle.postgres.test.mjs` prepares two-session booking, cancellation/refund review, reschedule rollback, FIFO offer ownership, expiry, ledger isolation and role tests. It is disabled by default. Running it requires explicit approval because it creates schemas/fixtures and loads proposal SQL into an empty local database. It rejects remote hosts, unnamed databases, nonempty schemas and embedded passwords; use a dedicated cluster with `anon`, `authenticated`, `service_role` roles, an empty `vetit_disposable_*` database and `psql`. The harness is a focused baseline/booking/lifecycle test, not proof of full commerce/seller migration integration. No automatic cleanup drops data.
3. **Expiry scheduling:** `appointment_lifecycle_tick()` is granted only to `service_role`. No secret, cron installation or public worker endpoint is added. An approved scheduler must call it regularly for unattended offer/waitlist expiry; mutation transactions also process their provider's expired offers. Batches are bounded and the worker should repeat until drained. An expired acceptance always fails even if the worker is delayed.
4. **Email/push and payments:** review consent/preferences, delivery credentials, deduplication/retry rules, webhook authentication and reconciliation before enabling outbox delivery or refund execution. No channel can currently send and no customer/provider can mark money refunded. Changes in payment status after a cancellation request need reconciliation against the payment ledger before any financial operation.
5. **Provider resources:** one key means one simultaneous reservation across a business's services. Clinics can name clinicians/rooms; grooming can name groomers; daycare can name individual places. Providers must not use different keys for the same physical resource. Slots are dated and at most 24 hours; recurring slot generation, staff/resource directories, multi-day capacity and overnight daycare rules remain separate work. Existing weekly availability display and location discovery are preserved.
6. **User acceptance/mobile release:** browser/device smoke tests and accessibility review remain necessary after the Test backend is enabled. The existing Expo 57.0.27 / React Native 0.86.0 mismatch (SDK expects 0.86.3) remains outside this change. Native authenticated lifecycle screens are not claimed as implemented; mobile uses the same web account flow.
7. **History limits:** the dashboard shows recent 200 bookings, 500 events, 200 offers/notifications/waitlist rows and future schedule slots. Immutable database history remains retained; full cursor pagination/export remains future work. Rescheduling keeps confirmation status and records an event; providers/customers get in-app notifications.

Expired/declined offers leave the customer out of the active queue; the customer can explicitly rejoin at the end. Only currently eligible market/price entries participate in FIFO allocation. Approve these operational rules and resource mappings with providers before enabling the backend.

The completed commit is not modified. Do not stage `supabase/.temp/cli-latest`. Keep `catalog-types.d.ts` with the existing catalogue/mobile type refactor when eventually reviewing/staging that work.

## Validation approach

Focused unit/HTTP tests cover cutoff boundaries, provider-specific late terms, integer refund calculations, trusted identity stripping, command/time bounds, stale-quote fields, conflict handling and offer acceptance. Proposal contract tests verify lock/ownership/grant/history/expiry/outbox invariants; **they do not execute SQL or prove concurrent database behavior**. Actual PostgreSQL tests remain explicitly gated. Existing availability/catalogue/seller tests are reused unless new code affects their paths.

Transaction and privilege design follows [PostgreSQL lock ordering guidance](https://www.postgresql.org/docs/current/explicit-locking.html) and [Supabase function security guidance](https://supabase.com/docs/guides/database/functions). The Supabase changelog index could not be fetched by the browsing tool; no changed Supabase API feature is required for this proposal.

## Results from this local implementation

- 25 focused unit/HTTP/proposal-contract tests passed. The explicitly disabled PostgreSQL suite was skipped; no SQL, fixture writes or migrations executed.
- Full Astro checking passed across 101 files: zero errors/warnings, two non-blocking async-conversion style hints. Final small revision/currency/UI-race safeguards were followed by a strict targeted check of appointment/services browser scripts and compilation of all three affected Astro components, with zero diagnostics (about 237 MB peak process memory).
- Mobile TypeScript passed with a 384 MB heap cap. No native bundle/device run or full production build was repeated.
- Git diff checking passed. The index is empty; commit `c8b12532dff381dfcac87a14f0013ae013b65eaf`, its five files, seller source, generated database types and previous commerce/booking proposals remain unchanged.
- Resource capacity now supports separate places/clinicians at the same service/start, with overlap checks for the same resource. This includes a guarded uniqueness-constraint change and must be validated by the prepared PostgreSQL capacity/concurrency tests before approval. Customer/provider history lookups have matching indexes.

This is ready for local code/proposal review, **not backend activation**. Approve disposable SQL/concurrency/RLS testing separately, then review Test migration/resource mappings and the expiry scheduler before enabling lifecycle operations. External delivery, cancellation-charge collection and automatic refunds remain disabled.

## Follow-up regression fixes

Provider cancellation now accepts explicit boolean intent from the provider UI and shared command client. The database requires active owner/admin membership before using provider rules, including when the actor also owns the booking. Ordinary customer cancellation continues to use saved customer terms; the flag grants no authority. Existing cancellation of another customer's booking still requires provider membership.

The expiry regression uses a separate service and queue, preventing earlier FIFO entries from changing its reassignment result. Prepared PostgreSQL cases additionally cover owner/customer overlap inside the cutoff, rejection of customer/catalogue-role escalation, cross-service shared-resource conflicts and failed reopening rollback.

Affected local suites: 28 tests passed, one PostgreSQL suite explicitly skipped. Appointment Astro compilation and Git diff checking passed. Real PostgreSQL role, expiry, concurrency and rollback assertions remain unexecuted and require separately approved disposable database setup; static contract checks do not prove them. No migrations, production access, staging or commits occurred.

## Windows test-environment preparation

The harness now calls `psql -f -` and streams UTF-8 SQL through stdin, keeping SQL out of process arguments. It retains `-X`, `ON_ERROR_STOP=1`, bounded output, no shell, and adds noninteractive authentication (`-w`) and a two-minute per-process timeout. Connection and empty-database guards remain unchanged. Two mocked runner tests passed with more than 100,000 characters and process/pipe failure cases; no PostgreSQL process or SQL execution was involved. Harness syntax and Git diff checks passed.

Read-only system inspection found Windows 10 Home Single Language 22H2, build 19045, x64, about 3.90 GiB usable RAM (0.27 GiB free during inspection). Free disk space was approximately C: 9.7 GiB, D: 379.8 GiB, E: 230.4 GiB and F: 180.2 GiB. No PostgreSQL/Docker/Podman executables, checked installation folders or PostgreSQL/Docker installer records were found. CIM inventory was denied; basic OS/architecture, memory and disk information were obtained without elevation. Runtime prerequisites remain to be confirmed; absence of one registry key does not prove a runtime is missing.

Recommended preparation is PostgreSQL 17 x64 at the latest stable patch offered by the official EDB distribution, using its binary archive and a manual, loopback-only cluster for this small test workload. No server service, pgAdmin, Stack Builder or Docker is needed. PostgreSQL.org links both the EDB installer and binary archive. The installer requires administrator privileges and initializes a cluster, so it is unsuitable for a binaries-only approval. A conservative planning allowance is 3 GiB for download, extracted binaries and the eventual small test cluster; this is an estimate, not a measured installation size. PostgreSQL has no licence fee. Close memory-heavy applications before later execution.

Next approval must explicitly permit downloading and extracting the official PostgreSQL 17 x64 binary archive into an agreed new directory (suggested `D:\VetitTestTools\PostgreSQL17`), including filesystem access there. Do not initialize/start a cluster, create roles/databases, install missing runtimes or execute tests under that approval. Those require a later scoped approval after binaries and prerequisite checks. No download, installation, database creation, migration application or production access occurred during preparation.
