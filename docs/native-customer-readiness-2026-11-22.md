# Native customer cancellation and notification readiness

Native appointments now expose eligible customer cancellation using the same confirmation, account binding, revision checks, timeout handling and reconciliation controller as provider actions. Customer and provider scope are selected from the current native dashboard, not a user-supplied role. Missing/legacy policy snapshots and ineligible cancellation windows do not expose an action. The shared API and PostgreSQL remain final authority for permissions and saved policy. Customer commands do not set `providerCancellation`, and no refund or payment is executed by the UI.

The customer taps cancel, reviews the saved-policy warning, and explicitly confirms. Acknowledgement is followed by a refreshed booking with a higher revision and cancelled status. Unknown results remain uncertain and cannot be retried automatically. Account changes, backgrounding and disposal clear private action state. Native dashboard responses carrying a different account identity are rejected. Booking/rescheduling/waitlist customer controls beyond cancellation still use the website and are not claimed complete by this milestone.

The native notification feed projects only notification ID, stable event type, timestamp and read state. Raw payloads, contacts and delivery addresses are not retained in native snapshots or rendered. The feed uses the existing authenticated dashboard ledger; no push/email/SMS sending, delivery worker, notification permission or provider registration was enabled. Provider schedule views do not show this customer feed.

## Dependency changes

Astro 7.3.7 was updated within major 7 to 7.4.13 for the two currently reported Astro advisories. The existing Vite security floor was aligned to 8.3.8 to avoid a conflicting peer constraint. A scoped `@napi-rs/wasm-runtime@1.2.4>@emnapi/runtime` override retains stable 1.11.3, matching the Astro checker core and preventing an incompatible 2.0 beta peer from breaking diagnostics. Other WASM runtime consumers are not globally downgraded. Production app configuration and credentials are unchanged.

Root audit now reports two moderate transitive advisories (`glob` and `minimatch`). Mobile audit reports four advisories (one high, three moderate: `uuid`, `zod`, `glob`, `minimatch`). The reported patched ranges require major transitive upgrades; no blanket overrides or Expo/React Native major upgrades were introduced. Mobile dependencies and its lockfile were preserved. Re-evaluate against compatible upstream releases before launch.

## Hosted acceptance, not executed

The admin migration approval package remains `docs/admin-backend-approval-checklist-2026-11-21.md`. No hosted target or migration was used here. After explicit staging approval, use synthetic customer and provider accounts to verify:

- Personal cancellation is policy-eligible, revision-checked and account-bound; provider cancellation requires current membership and its explicit intent.
- Missing policy, policy denial, conflict, outage, backgrounding and account switch do not issue automatic retries or reveal prior-account data.
- Refreshed cancellation matches the database ledger and payment-review record. No charge or refund is executed.
- Notification rows are owner-scoped and payloads are absent from the device view and state; unread/read rendering and future delivery are tested separately.
- Default English and Hindi/fallback copy, narrow screens, assistive labels and physical Android/iOS behavior pass device acceptance.

Real provider adapters must implement the existing server-only sandbox charge and lifecycle contracts first: bounded calls/AbortSignal, stable provider references, independently authenticated provider evidence, matching order/attempt/reference and currency/amount, durable mismatch review, and idempotent creation. A mock proof is not hosted/provider acceptance. No real credentials, live payment implementation, webhook registration or hosted scheduling is supplied here. Provider selection, sandbox account access, staging approval, notification delivery, native customer booking/rescheduling/waitlist controls, remaining dependency advisories and device/store acceptance remain launch blockers. This checkpoint is suitable for continued isolated acceptance work, not a launch approval.
