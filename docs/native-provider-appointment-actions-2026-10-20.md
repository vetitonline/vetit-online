# Native provider booking actions — 20 October 2026

Continued from the saved development-readiness handover. Recovery searches and previously completed browser/database/security suites were not repeated. No hosted requests, synthetic hosted sessions, database changes, migrations, production environment changes, commits, pushes or deployments occurred. All mutation tests use synthetic in-process responses.

## Completed locally

The injected-session account view now lets a provider confirm a requested appointment, complete a confirmed appointment after its displayed end time, or cancel as provider. Controls are limited to a selected business returned by the verified dashboard. Customer mode, foreign/missing bookings, malformed revisions and unsupported actions cannot prepare a provider command. UI gating is not authorisation: the existing API verifies the bearer session and the database's current provider permissions and expected revision remain authoritative.

Each action requires an additional confirmation showing the action, service and appointment time. Back leaves the appointment unchanged. Confirmation rechecks the current business, booking revision, eligible status and session identity; double taps coalesce into one POST. Commands use the existing shared normalizer and include `expectedRevision`. Native bearer commands omit cookies, reject redirects, use no-store transport and have a bounded auth/write deadline. Cookie-based web commands preserve same-origin credentials.

Success is verified through a fresh read, not an optimistic status change. Unknown outcomes—including timeouts, connection failures and malformed acknowledgements—block further actions until reconciliation. An unchanged revision/status does not unlock retry. The desired status with an advanced revision verifies success; another advanced revision requires a new decision. Definite rejection/conflict requires a fresh read and new confirmation. No automatic write retry or invented idempotency key was added to the backend contract.

Account/background/configuration changes clear private action state; old responses cannot revive it. Stale view objects cannot prepare actions after clearing. There is no persistent native write journal: the backend's revision guard is essential across remounts and uncertain in-flight requests. An aborted or timed-out request is not described as rolled back.

Provider cancellation explicitly states that refunds may require review. This feature issues no refund or payment-charge command. It does not enable the proposed hosted SQL runtime or install a new auth/storage adapter.

English remains default. Hindi action/confirmation/reconciliation copy uses the shared Indian-language/script/region fallback, preserving extension points for all scheduled Indian languages and additional reviewed locales. Unsupported translations use English. Times retain the explicit Asia/Kolkata label. No complete translation or device accessibility certification is claimed.

## Validation

- Nine new provider tests passed: explicit confirmation/transport/coalescing, provider scope and status restrictions, back/cancel behavior, unknown-outcome reconciliation, stale-revision conflicts, completion revision rechecks, identity/background races, timeout handling and actual native TSX handlers with English fallback.
- Seven affected native appointment read/component tests passed after projecting required lifecycle revisions.
- Two affected shared command-client tests passed: bounded cancellation/reschedule transport and independent conflict handling without automatic retry.
- Standard `pnpm -C mobile typecheck` passed.
- Updated web compilation and Android/iOS JavaScript bundle results, source hashes and external output paths are recorded in the separate provider-action readiness receipt. Bundle checks use `--no-bytecode`; they are not Hermes/device/binary acceptance.

No unrelated full test suite, historical SQL test, dependency installation or browser fixture rerun was needed. The preceding four synthetic browser scenarios remain applicable to the unchanged moderation fixture, not certification of this new native view. The informational standalone-mobile JS module warning remains.

## Remaining blocker and next milestone

Local fixtures do not establish operation against an approved coordinated Test database, real verified synthetic provider session, protected OS storage or device runtime. Those remain concrete integration blockers. Production deployments, live database changes and production environment-variable changes require the user's explicit approval.

Next local implementation: provider slot creation/block/reopen and policy editing with validated resource/timezone/policy contracts and uncertain-write reconciliation, followed by native seller onboarding/catalogue editing. Customer booking/rescheduling, operational order placement, payment and delivery remain separate unfinished work. Existing signed-in web appointment flows remain available where their runtime is approved.

## Source changes

- `mobile/src/provider-appointment-actions.js` and `.d.ts`: scoped confirmation/reconciliation controller and language copy.
- `mobile/src/NativeAppointments.tsx`: confirmation surface and action controls.
- `mobile/src/appointments.js` and `.d.ts`: required projected lifecycle revision.
- `src/lib/services/appointment-lifecycle-client.js`: redirect-safe, cookie-free native bearer POST transport.
- `tests/native-provider-appointments.test.mjs`, `tests/native-appointments.test.mjs`, `tests/native-component-harness.mjs`: focused source/handler fixtures and revision contract.
- Root test command and mobile/development handovers.

Existing uncommitted work is retained. Backups and generated validation evidence remain outside the source repository; previous recovery evidence is unchanged. No commit or integration action was performed.
