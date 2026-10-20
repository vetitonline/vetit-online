# Web and mobile development handover — 20 October 2026

Subsequent provider booking-action work is recorded separately in [native-provider-appointment-actions-2026-10-20.md](native-provider-appointment-actions-2026-10-20.md). The results below retain the preceding read-only milestone's scope.

Continued from the preserved recovery audit in `C:\Users\DELL\vetit-online`. No recovery searches were repeated, historical SQL applied, hosted sessions created, production environment variables changed, commits pushed or deployments performed. Existing development work and private backups remain preserved separately.

## Local milestone completed

The injected-session account tab now has native personal appointments and provider schedule review. It reuses the existing read-only `/api/appointments` contract. Provider selection is restricted to the verified dashboard's returned businesses, then checked again on the refreshed response. SQL permissions remain authoritative; a client-side list does not grant access.

The native controller projects bounded bookings, businesses, services and slots rather than storing raw customer rows, tokens, notifications or payment records. It verifies session identity before and after reads, coalesces duplicate requests, bounds authentication/transport to ten seconds, ignores stale replies, and clears private views on backgrounding, sign-out, account change and disposal. The first verified identity can complete its initial read without a false account-change conflict. Invalid data, revoked provider access and unavailable RPCs fail closed.

English remains default. Hindi copy uses the same shared locale registry as existing views; English plus the 22 scheduled Indian language codes and script/region extension points remain available. Unreviewed language copy falls back to English. Appointment times explicitly use Asia/Kolkata. This is extensible language support, not complete translation coverage.

Native appointment changes, provider policy/slot editing and seller catalogue management remain unfinished. The existing signed-in web appointment flow remains available; this increment adds no native mutation path and enables no hosted SQL or automation.

## Reproducible local issues fixed

1. Metro could not resolve shared imports outside `mobile/`, including `../src/lib/supabase/test-endpoints.js`. Added `mobile/metro.config.js` to expose shared source and the original logo while excluding the web dependency cache and build directories. Subsequent bundle exports resolve these files.
2. Installed Expo 57.0.27 declares React Native 0.86.3, but mobile pinned 0.86.0. Aligned the exact version and standalone mobile lockfile using the existing pnpm store. React 19.2.3 and React Native 0.86.3 now both match Expo's bundled version declarations. Root dependencies were not upgraded.
3. Appointment dashboard reads now omit browser cookies when using bearer authentication, reject redirects and bound token length. Cookie-based web reads retain same-origin credentials. Mutation transport was not changed.

## Validation and its limits

- Final web production compilation: `pnpm run build` passed. Vercel build output was generated locally; nothing was deployed.
- Standard installed mobile compiler: `pnpm -C mobile typecheck` passed. A check attempted during dependency relinking saw temporarily absent Expo configuration; the stable post-install check passes.
- Seven new native appointment tests passed: verified GET transport/DTO privacy, provider membership/revocation, initial identity establishment, account/background races, timeouts/coalescing, malformed/oversized data, actual component selection and language/timezone fallback.
- Three affected appointment-client regression checks passed. No full existing suite was repeated.
- Isolated Edge browser fixture acceptance passed all four scenarios: stale-decision conflict, expired-session mobile layout, duplicate clicks and lost-response idempotency. TAP reports five passing cases including the parent, zero failures and zero skips. Only synthetic localhost markup/auth/RPC was used; this is not full Astro SSR or hosted auth/Storage acceptance.
- Android/iOS JavaScript export uses one Metro worker and a 1 GiB heap cap; generated files live outside the repository. Final export locations and source hashes are recorded in the separate readiness evidence. Exports use `--no-bytecode`: they do not certify Hermes bytecode, an installable native binary or device execution.
- Existing passing seller, moderation, locale, SQL/security and native order/quote tests were reused from the handover. No historical database tests or migrations were rerun. The previously memory-limited full Astro diagnostic remains distinct from the passing production build.

The informational Node warning about module syntax in standalone mobile JS remains; changing module mode would also affect Metro configuration and was not needed to pass these checks.

## Readiness blockers and next milestone

Web compilation, focused source/controller/component checks and synthetic browser fixtures pass. Real browser sessions against the coordinated Test runtime, physical/simulator rendering, protected storage/UUID bindings, OTP/session behavior, provider integrations and actual database authorisation/concurrency still require their separate runtime environment and scoped synthetic identities. No successful hosted or device integration is claimed.

Next implementation milestone: native provider appointment actions (confirmation/completion, cancellation and schedule editing) using the existing validated command contracts, explicit confirmation and uncertain-outcome reconciliation, followed by native seller catalogue management. Operational checkout/order placement/payment remains a separate unfinished integration. Do not infer permission to apply historical SQL, activate payments or deploy from this handover. Production deployments, live database changes and production environment-variable changes require the user's explicit approval.

## Files in this increment

- `mobile/src/appointments.js`, `appointments.d.ts`, `NativeAppointments.tsx`: controller, projected contract, translations and native view.
- `mobile/App.tsx`: integrates the view using the existing injected session; preserves prior account/cart/reviewer features.
- `mobile/metro.config.js`: shared-repository module visibility.
- `mobile/package.json`, `mobile/pnpm-lock.yaml`: Expo-compatible React Native patch version.
- `src/lib/services/appointment-lifecycle-client.js`: safe native read transport.
- `tests/native-appointments.test.mjs`, root `package.json`: focused checks and test command.
- `mobile/README.md`, `docs/mobile-marketplace-next-step.md`, this handover: current capability and acceptance limits.

Changes remain local and uncommitted for review. Original recovery reports, archives and evidence manifests were not replaced.
