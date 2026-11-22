# Sandbox notification delivery and release approval package

## Implemented, not hosted

The existing appointment outbox remains disabled by default. The unapplied proposal `supabase/test-project/appointment-notification-sandbox.proposal.sql` adds synthetic-target claims and durable receipt history; it changes no default, notification payload or existing queue row. Artifact SHA-256: `a293123715fe2e4c8679456db86cccef74cb9d206295db539b5b7c94cdda4136`.

Only service-role functions can explicitly queue a disabled row to `synthetic:<reference>`, atomically claim a bounded batch, and finish a matching claim. There is no public delivery route, scheduler registration or address/device-token lookup. Real email addresses and push tokens are rejected as targets. Failed rows can be requeued only explicitly to the same synthetic target; processing/unknown rows cannot be requeued. Concurrent workers use `FOR UPDATE SKIP LOCKED`. Receipt history preserves prior attempts when a known rejected delivery is explicitly requeued.

`createSandboxNotificationWorker` requires explicit approval and a sandbox/idempotent provider adapter. Both RPC and provider calls have bounded deadlines. Every claim is validated before any send. The adapter gets a stable outbox idempotency key, synthetic target, channel and a fixed English privacy-preserving message; no raw notification payload, contact details, clinical information or customer profile ID is forwarded. Verified evidence must match provider, channel, target and idempotency key before finalization. `sent` means accepted by the mock provider, not delivery to a device or inbox. Outputs contain counts only.

Unknown claim/send/finish outcomes are not automatically retried or reclaimed. Processing rows remain protected for approved reconciliation by idempotency key. Crash recovery, provider status lookup/manual review and operational alerts are required before production use; this is not an exactly-once delivery guarantee. Database receipts are idempotent for an identical finish; a wrong claim or state regression is refused. The implementation supplies no real provider SDK or credentials and never enables live payments.

## Approval sequence and hosted staging acceptance

No hosted execution is authorized by this document or by a successful test. Before executing anything externally, approve the exact staging target, proposal hash/baseline, service-worker identity, synthetic recipient policy and provider data-sharing terms. Existing admin/checkout proposal approvals are separate; do not apply all pending SQL together by default. Production application or deployment requires separate approval after staging acceptance.

After approval, use synthetic accounts and a reviewed sandbox adapter:

1. Confirm function/schema ownership and grants; anonymous/customer/seller calls must be denied. Existing customer notification reads and mark-read remain owner-scoped. No new table-level client access is permitted.
2. Create an appointment and verify both outbox channels stay disabled. Queue only named synthetic rows with the trusted worker; do not bulk-enable existing notifications.
3. Run two workers concurrently and verify disjoint claims and stable idempotency keys. Validate receipt linkage and idempotent finalization. Confirm all unqueued rows stay disabled.
4. Exercise rejected receipts, invalid evidence, claim RPC timeout, provider timeout, finish acknowledgement loss and process termination after send. Unknown processing rows must not be resent automatically. Verify provider status independently before any approved reconciliation/recovery operation.
5. Verify payload/contact/clinical data never appears in adapter inputs, worker results or logs. Check authenticated deep-link routing separately; opening an update must never reveal the previous account's data.
6. Test known-rejection requeue only with the same target, preserving historical receipts. Confirm delivery monitoring distinguishes accepted, explicitly failed and unconfirmed work. Review provider-specific retention, consent, opt-out and message-template requirements before live adapters are considered.
7. Keep hosted scheduling, real recipients and real payments disabled throughout sandbox acceptance. Record evidence and approver before requesting promotion.

A real adapter must not simply label a live transport `sandbox`. It needs verified sandbox account isolation, provider-side idempotency and independent status evidence, approved test-recipient resolution, server-only credentials, bounded requests and explicit unknown-outcome reconciliation. Provider acceptance is not handset/inbox delivery. No such integration has been verified here.

## Physical-device/store readiness

`pnpm check:mobile-release` is an offline manifest declaration check. It makes no network/signing calls and always reports `runtimeVerified: false` and `storeSubmissionAuthorized: false`. A complete synthetic manifest is not proof that assets exist or that a signed build works.

Current concrete blockers: missing iOS bundle identifier/build number, Android application ID/version code and store icon configuration. Existing app configuration was preserved. Identity choices, signing access and store accounts require user approval; no identifiers were invented.

On approved signed Android/iOS test builds, collect evidence for:

- Clean install, upgrade, OTP/session renewal, secure-storage failure, sign-out and switching accounts while requests are pending.
- Native new booking, cancellation, rescheduling, waitlist join/leave, offer acceptance/decline and notification readback under current pricing and policy; repeated taps and lost responses must not cause automatic duplicate writes.
- Offline/poor network, background/foreground, termination after dispatch, expired offers and stale revisions. Check final database state before another action.
- English default, Hindi/fallback copy, India timezone, narrow/large screens, font scaling, keyboard and screen-reader labels.
- Permission denial/revocation and delivery foreground/background/terminated behavior once a separately approved notification adapter exists. No push entitlement/permission was activated by this milestone.
- Custom-scheme and store/universal-link account routing, privacy policy, Google Data Safety, Apple privacy declarations, screenshots/assets, consent/retention, reviewed signing and internal-track/TestFlight acceptance.

No physical-device or store test was performed. Hosted Auth/RLS/provider acceptance remains unverified.

## Targeted advisory assessment, no upgrades

Audits of current lockfiles on 22 November reported:

| Scope/path | Installed | Reported fix | Severity |
| --- | --- | --- | --- |
| Web Vercel adapter → nft → glob | 13.0.6 | >=14.0.2 | moderate |
| Same chain → minimatch | 10.2.6 | >=11.0.1 | moderate |
| Mobile Expo config plugins → xcode → uuid | 7.0.3 | >=11.1.1 | moderate |
| Mobile Expo CLI → zod | 3.25.76 | >=4.6.6 | high |
| Mobile Expo/config tooling → glob | 13.0.6 | >=14.0.2 | moderate |
| Mobile Expo/config tooling → minimatch | 10.2.6 | >=11.0.1 | moderate |

These are reported dependency paths, not proof of runtime exploitability or absence of exposure. Reachability in release bundles and provider/build inputs still needs assessment. Fixes cross major transitive versions; broad overrides may break Expo/Xcode tooling, Zod APIs or glob behavior. No versions, lockfiles or dependency overrides were changed. A separate compatibility/risk review and approval are needed before upgrading, followed by type/build/native export and physical-device acceptance. Prefer compatible upstream SDK/adapter releases when available.

The checkpoint is suitable for isolated sandbox acceptance, not public launch. Remaining blockers include provider integration/reconciliation, approved hosted changes, notification delivery operations, missing mobile release configuration, device/store evidence, remaining advisories and payment/shipping/refund acceptance.
