# Security remediation, reconciliation and mobile release configuration

## Completed safely

User-confirmed `com.vetitonline.app` is now the iOS bundle identifier and Android application ID. Initial local build counters are iOS `1` and Android `1`; the existing app version, name, scheme and appearance were preserved. `mobile/eas.json` prepares internal APK/physical-iOS and store-candidate profiles with local credentials and a committed-tree requirement. It has no submit profile, automatic version increment or hosted credential configuration. No EAS build/upload, signing operation, store submission or deployment was performed.

The current store manifest assessment has one local configuration blocker: store icon configuration. The existing transparent logo is 700×476, not a square 1024×1024 store icon; it was preserved rather than mislabeled as store-ready. A suitable brand asset still needs to be prepared/reviewed and configured. `pnpm check:mobile-release` never grants store authorization or claims device acceptance.

## Targeted dependency remediation

- Vercel adapter: 11.0.12 → 11.0.22, within the existing major line. Its supported nft dependency now resolves the patched glob/minimatch chain.
- Expo: 57.0.27 → 57.0.33, within the same SDK patch line. SDK-maintained tooling updates remove the vulnerable uuid, Zod and glob paths. React and React Native versions were not upgraded, and no blanket major transitive override was introduced.
- Post-change `pnpm audit`: **zero findings in the web workspace**; **one moderate mobile finding**, minimatch 10.2.6 through Expo fingerprint 0.20.16. The required patched range is >=11.0.1. The currently published newer fingerprint line also still declares minimatch 10, so forcing version 11 is not treated as a compatible fix.

These are known audit findings, not a security guarantee. Remaining fingerprint reachability/compatibility needs a separate review. No breaking upgrade was attempted; any forced major override needs approval and fingerprint/build regression evidence. Existing dependency security overrides were preserved. Both lockfiles record the supported package updates.

## Unknown notification delivery reconciliation

The sandbox worker now supports `reconcile(outboxId)` using an optional server-only `getVerifiedStatus` adapter. It reads the claimed synthetic delivery, queries the provider by the original idempotency key, validates provider/channel/target/key evidence, and finalizes the original claim only for verified acceptance or rejection. It never calls `send`. Pending/unknown evidence remains unconfirmed; provider-not-found must not be converted into a failure that permits a resend. A database-confirmed prior finish resolves an acknowledgement loss without querying or sending again.

The additive read-only proposal is `supabase/test-project/appointment-notification-reconciliation.proposal.sql`, SHA-256 `0a37c741b1adad645997a324822ae8979084401a0f29b4eded72f88b088a16e2`. It depends on the prior sandbox outbox proposal, is executable only by `service_role`, and cannot queue or reactivate notifications. Neither proposal was applied to any hosted database. Mismatched/unverified evidence or unknown finish outcomes fail closed. Manual/provider-supported recovery is still needed where an unknown claim never reached the provider; no automatic reclaim/resend was added.

Payment reconciliation already exists in the sandbox checkout lifecycle worker and was retained/regression-tested rather than duplicated. No real payment or delivery adapter, provider account, credentials, webhook or hosted scheduler was installed. `sent` still means verified provider acceptance, not handset/inbox delivery.

## Verification and its limits

Application regression suite: 145 tests, including provider-proof binding, pending/unknown outcomes, no-send reconciliation, lost-finish recovery and release profiles. Isolated PostgreSQL: 15 tests, including real claim lookup privileges, reconciliation and idempotent receipt preservation. Web/mobile type checks and SSR build passed. Chromium desktop/mobile checkout guards passed. Expo effective configuration resolved the confirmed identifiers, and Android/iOS offline Hermes bundle exports passed using the existing React Native line. No signed native binary or physical device was tested.

Reproducible checks: `pnpm test:notification-delivery`, `pnpm test:appointment-account`, `pnpm test:appointments-db`, `pnpm check:mobile-release`, `pnpm check`, `pnpm build`, and mobile `typecheck`. Offline Expo CLI checks use `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1` and run the installed CLI directly; no publishing or signing is needed for bundle exports. Sandbox database tests use only the pinned, disposable network-isolated local container.

## Outstanding approval/acceptance gates

1. Review the exact staging target, schema baseline and unapplied proposal artifacts before any hosted migration. Existing admin/checkout proposal approval packages remain separate; do not apply all proposals indiscriminately.
2. Select/approve provider sandbox accounts, test-recipient policy, data-sharing/consent and independent status verification. Run approved hosted Auth/RLS/worker acceptance, including failed evidence, outages, crash recovery and idempotency. Real payments/deliveries and scheduling need separate approval.
3. Prepare/review the square store icon. Supply local signing material securely; do not commit credentials. Increment local build counters for subsequent binaries. Build profiles are configuration only, not permission to execute a hosted build or submit.
4. Complete physical Android/iOS acceptance of authentication, booking/cancellation/rescheduling, waitlist join/leave/offer decisions, notification readback, account changes, offline/background/termination cases, deep links, language/accessibility and eventual notification permissions/delivery.
5. Complete store privacy/data-safety declarations, screenshots/assets, operational refund/support handling and internal-track/TestFlight acceptance. No store submission is authorized.
6. Resolve or formally assess the remaining fingerprint/minimatch advisory through a compatible upstream fix or a separately approved compatibility change.

This is a substantially improved isolated acceptance candidate, not public-launch approval. Production configuration, hosted database data and existing workflows were preserved.
