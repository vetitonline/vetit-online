# Mobile testing readiness — 27 November 2026

## Preserved checkpoint

Repository: vetitonline/vetit-online. Branch: codex/marketplace-accounts-2026-11-06. The 23 November checkpoint was clean before the 27 November preparation; the prepared launcher changes were preserved when this consolidated session resumed. Local and live GitHub branch both identified checkpoint 30eabdf16663834519b08fbef6b7beced9e2864b. No reset, recovery audit, backup recreation, migration, production configuration change or dependency upgrade was needed.

Reviewed the existing phone guide, mobile entry, Metro shared-source configuration, native offers/notifications development report and earlier development handover. The explicit mobile/index.js entry still registers the existing App.tsx with Home, Shop, Services, Cart and Account. No mobile UI or website/backend functionality was replaced.

## Prepared improvements

The existing launcher accepts --host auto (also the default). It chooses a unique eligible private IPv4 address and refuses to guess if several private adapters exist. It excludes loopback, public addresses and IPv6. It cannot establish phone reachability or identify Wi-Fi among several adapters; it lists candidates and asks for --host ADDRESS in that case. Previously supplied 192.168.1.35 must not be assumed current.

Optional --port permits an explicit free Metro port, rejecting malformed values and collision with fixture port 4324. Existing explicit --host commands remain valid. No environment files are edited, no helper is installed and no dependencies are changed by this launcher.

This consolidated milestone saves the prepared launcher changes to the same feature branch. Added Windows-safe test subprocess paths, CRLF-compatible entry verification and Ubuntu/Windows CI jobs; hosted CI results remain distinct from locally passed checks.

## Validation

- 24 focused launcher, native entry, fixture/evidence, device compatibility and native component tests passed; zero failures. A further 17 browser-cart/checkout regression cases passed in the consolidated checkpoint. Launcher/entry tests also passed after Windows path and CRLF fixes (41 distinct cases overall).
- Mobile TypeScript check passed.
- iOS and Android Hermes exports passed, using mobile/index.js, into /tmp/vetit-mobile-validation-20261127. These are compilation results, not installed-phone acceptance.
- Live launcher startup generated an Expo Go QR on cloud test port 8090; Metro /status reported packager-status:running.
- Fixture /__device/health reported fixtureOnly=true, databaseAccess=false, providerAccess=false, mutationsEnabled=false, nativeAuthentication=false.
- Fixture catalogue returned one synthetic product; services returned three synthetic listings. Existing tests reject all writes and credential-bearing requests.
- Cloud startup's optional React Native DevTools window failed because its Chromium sandbox is not configured. Metro and both bundle builds passed; no sandbox protection was weakened.
- Existing root web build passed. No database tests were rerun: no SQL or database behavior changed.

The installed Expo 57.0.33 module manifest matches React 19.2.3 and React Native 0.86.3. Reported Android 16 and iOS 27.2.1 exceed installed framework floor hints. Neither this nor successful compilation certifies the phones or current App Store/Play Store Expo Go SDK support.

## Connection limits and physical testing

Current cloud status still reports restricted outbound access with no Expo/ngrok grant and only an SSH portal. No HTTP preview is configured. Failed ngrok attempts were not repeated, and no phone-accessible cloud link is claimed. Cloud smoke servers were stopped after verification. A synthetic HTTPS fixture hosting package prepared earlier remains outside Git under /tmp; nothing was hosted.

On the Windows laptop, connect both phones to the same trusted private Wi-Fi. In the repository root, use `node scripts/start-phone-preview.mjs --host auto` after updating the existing feature-branch checkout with `git pull --ff-only` when its working tree is clean. If multiple adapters are reported, use `ipconfig` then `node scripts/start-phone-preview.mjs --host CURRENT_WIFI_IPV4` instead. Allow Node only on private networks. Open the printed fixture health URL in each phone browser. Scan the new QR in that same PowerShell window with iPhone Camera → Open in Expo Go, or Android Expo Go's scanner. Keep the terminal open. If Metro's default port is occupied, the prepared version supports --port 8090.

Expect Vetit's five tabs and synthetic catalogue/cart/services. Test quantity changes/removal, service availability, English/Hindi, text scaling and background/resume. Account login, cancellation/rescheduling, waitlist and private notifications require the separately approved trusted Test session host; these must remain NOT RUN for this public preview. Checkout, actual payment/delivery providers, hosted auth/RLS and signed build/device acceptance remain launch blockers. No new QR from the cloud is usable on the home network.

## Checkpoint and backup reference verification

The live recovery branch codex/recovery-checkpoint-2026-10-21-1cfcc1b still points to 1cfcc1b54e5d23f594f8ea2aa519a9b9e28fc759. Existing /tmp HTTPS fixture preparation and native bundle validation directories remain present; temporary artifacts are not durable backups. Older Windows Git-bundle evidence is referenced in docs/laptop-handover-2026-10-20.md but cannot be inspected from this cloud machine. No backups were recreated or modified, and no full recovery audit was repeated.

The existing dependency/SDK versions remain unchanged. Windows CI is prepared, not claimed to have run locally: this environment is Linux. Android/iPhone installation and App Store client SDK support still require physical validation. No hosted integration, payment, scheduler or production deployment is enabled.
