# Icon integration, signing and sandbox acceptance package

## Completed locally

- Added `mobile/assets/app-icon.png`, a square opaque RGB brand-mark icon derived from the existing purple/orange animal logo. It omits the wordmark for small-screen use. The original `Vetit-online-transparent.png` remains unchanged. The generated source is 1254×1254; Expo can use this square high-resolution input when generating platform icon sizes. No signed native icon output or store upload was produced.
- Configured the source as the Expo icon and Android adaptive foreground. The existing Android background colour and confirmed app identifiers/build counters were preserved. Artwork/mask appearance still requires human review on physical devices.
- Enhanced `check:mobile-release` with actual bounded PNG inspection: project-contained path, signature/chunk checksums, square dimensions >=1024, opaque RGB, complete bounded image data and valid filters. Its local declaration/asset result is now complete. It still returns `runtimeVerified: false` and `storeSubmissionAuthorized: false`.
- Added a public `mobile/credentials.example.json` template, not a private credential file. Added ignore rules for `credentials.json`, the private credentials folder, keystores, certificates, provisioning profiles and private signing keys. `.fingerprintignore` also excludes signing material with short reviewed patterns; app config and icon assets remain included.
- Added offline signing and provider-capability declaration checks. They never sign, contact a provider, verify a password or authorize hosted execution. Placeholder credentials remain blocked. Even complete declarations cannot self-approve live operation, hosted tests or store submission.

Commands: `pnpm test:release-readiness`, `pnpm check:mobile-release`, `pnpm check:mobile-signing`, `pnpm check:provider-sandbox`. Signing defaults to the public example. Only after approval, an operator may explicitly pass a private local file using `node scripts/check-mobile-signing-readiness.mjs --file <path>`; output excludes its values. This checks shape only, not certificate validity, passwords or profile/Team ID matching. Do not commit actual signing material.

## Provider sandbox acceptance, approval required before execution

`docs/provider-sandbox-readiness.example.json` is intentionally incomplete and contains no credentials or guessed account endpoints. Populate declarations only when corresponding evidence exists. The assessor's output is not that evidence and cannot authorize a run.

For each chosen provider, record the approved staging target, account/environment, responsible reviewer, credential storage owner, data-sharing/consent decision and fixture-recipient scope. Keep real customer targets, hosted schedules and real payments disabled.

| Area | Required sandbox evidence |
| --- | --- |
| Payment | Stable idempotent creation, verified status lookup, correct order/attempt/reference/amount/currency binding, duplicate/late/mismatched events, timeout/crash reconciliation and manual review |
| Delivery | Synthetic recipient isolation, stable outbox key, receipt binding, bounded send/status calls, accepted versus device-delivered distinction, rejected/unknown results and no automatic resend after an unknown outcome |
| Shipping/tax | Server-derived product/seller prices, explicit INR minor-unit policy, coverage, quote expiry, changed price/stock, mismatched provider references and expired quote rejection |

Use the existing `checkout-lifecycle.server`, `checkout-rates.server`, sandbox charge factory and notification delivery worker contracts/tests; do not duplicate transactional inserts or trust browser payment claims. No real adapter SDK/credentials or new hosted endpoint is supplied here. Apply only explicitly approved SQL artifacts after checking the target baseline and prior proposal dependencies. Existing admin/notification migration approval packages remain separate. Record hosted Auth/RLS acceptance, least-privilege RPC checks and synthetic end-to-end evidence before requesting production approval.

## Signing and physical-device checklist

The existing EAS profiles use local credentials and require a committed tree. They have no submit profile or auto-increment configuration. No EAS command, hosted build, signing operation or store submission was executed.

After separate approval, prepare Android keystore/alias and iOS certificate/profile using the chosen identities `com.vetitonline.app`. Verify certificate expiry, Team ID, profile distribution type, entitlement matching, backups/access controls and the next unused build counters. The placeholder template cannot be used as real credentials. Prefer secure storage outside version control; never paste secrets into reports or logs.

Capture platform, OS/device model, exact commit/build identifier, result, evidence link and reviewer for each case on both physical Android and iOS:

1. Clean install, signed upgrade and launch; icon clarity at launcher/app-switcher sizes and Android circle/squircle masks; native splash/icon assets; version/build values.
2. OTP sign-in, session renewal, secure-storage denial/failure, sign-out, account switching and custom-scheme routing. Links must show no previous-account records or clinical/contact data.
3. Native booking with current price/policy confirmation; cancellation; replacement-slot rescheduling with preserved service/price; waitlist join/leave; offer review/expiry/acceptance/decline; notification readback.
4. Repeated taps, account changes during reads/writes, conflicting revisions, unavailable slots, changed prices and lost acknowledgements. Reconcile state before another mutation; no automatic duplicate requests.
5. Offline/poor connection, background/foreground and force termination after dispatch; expired offers and provider outages. Verify final database/provider evidence, not just a UI success label.
6. English default, Hindi/fallback copy, India timezone, font scaling, keyboard and assistive labels on narrow, large and tablet screens.
7. Once a separately approved transport exists, permission denial/revocation and delivery foreground/background/terminated. Verify idempotency, consent, opt-out and privacy-preserving content. No notification permission or push entitlement was activated here.
8. Reviewed store icon/screenshots/metadata, privacy policy, Google Data Safety, Apple privacy declarations, signing backups, internal track/TestFlight acceptance and operational support/refund handling. Submission remains a separate approval step.

## Expo fingerprint advisory investigation

No dependency versions or lockfiles changed. Installed fingerprint remains 0.20.16 with minimatch 10.2.6. The currently published fingerprint 0.21.10 still declares `minimatch: ^10.2.6`; the reported patched range is >=11.0.1. No supported upstream fix was identified, and no major override was forced.

Inspected call path: fingerprint `build/Options.js` collects ignore paths from project options/config and `.fingerprintignore`; `build/utils/Path.js` constructs `new Minimatch(...)` for these patterns and directory match objects. This identifies build-tool/project-input exposure; it does not establish a universal non-exploitability claim. Keep fingerprint configuration/pattern inputs reviewed and do not run untrusted project configuration alongside signing secrets. The new ignore file protects signing material but is not an advisory fix.

Offline Android and iOS Hermes exports with source maps succeeded. `assess-fingerprint-bundle.mjs` inspected 2 maps/1232 sources and found neither `@expo/fingerprint` nor `minimatch` in those maps. This is evidence about those generated JS bundles only, not build tooling, dynamic/native code or every release. The script always leaves `advisoryResolved: false`, `allRuntimeReachabilityVerified: false` and `upgradeAuthorized: false`. Reproduce it with paths to freshly generated maps after future upgrades.

## Validation and remaining gates

153 application/readiness tests passed. Web/mobile type checks and SSR build passed. Android/iOS offline bundle exports passed; source maps stayed in temporary local artifacts rather than the repository or a hosted site. No SQL or transactional backend logic changed, so the already-passing isolated database suite was not needlessly repeated.

Remaining launch blockers: the moderate fingerprint advisory and compatibility review, reviewed artwork on native masks, private signing credentials and signed/device acceptance, provider selection/credentials and independently verified sandbox integration, approved hosted migrations/Auth/RLS acceptance, real notification operations, store/privacy acceptance and operational payment/refund readiness. Static check results are not approvals. No production action, real payment/delivery, hosted migration, deployment or store submission occurred.
