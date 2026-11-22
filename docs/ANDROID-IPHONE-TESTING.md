# Vetit Online: practical Android and iPhone test runbook

This runbook targets the current feature branch. It does not authorize hosted migrations, live payments/delivery, deployment, signing uploads or store submission. Use synthetic data. Do not send passwords, OTPs, tokens, private keys, keystores, certificates, provisioning profiles, Apple IDs or phone UDIDs in chat or test reports.

## 1. Write down your equipment

Record Android model/Android version, iPhone model/iOS version, and whether your computer uses Windows, macOS or Linux. Model/OS are enough; unique device IDs do not belong in the evidence file. Keep both phones and computer on the same trusted private Wi-Fi. Guest Wi-Fi isolation, VPN routing or firewall rules may prevent LAN access.

The project currently uses Expo SDK 57. Check whether the Expo Go installed on each phone supports SDK 57. Do not upgrade this project merely to fit the latest Expo Go. Android may have an SDK-matching client available from the official `https://expo.dev/go` page; do not use third-party APK mirrors. iPhone App Store Expo Go normally supports only the current SDK. If incompatible, mark the native preview BLOCKED and use the separately approved signed-build route in section 4. Safari connectivity checks can still run but are not native-app acceptance.

## 2. Public phone preview with no hosted backend

This route tests launch/layout, public browsing, in-memory preview cart and fixture availability. It does **not** test native authentication, booking writes, payment, persistence or delivery. The new fixture server has no Supabase/provider connection, rejects credentials and every write, and serves only synthetic data.

1. Run these servers on a computer your phones can actually reach. A Codex/cloud workspace's `localhost` or private IP is not your home computer's LAN address. If you only have the cloud checkout, clone the branch onto your computer in a **new unused folder**, or discuss a separately approved remote test route; do not assume cloud ports are phone-reachable. For a new local checkout:

   ```sh
   git clone --single-branch --branch codex/marketplace-accounts-2026-11-06 https://github.com/vetitonline/vetit-online.git vetit-phone-test
   cd vetit-phone-test
   ```

   Use an existing local checkout instead if appropriate, preserving its uncommitted work. Do not reset or overwrite it. Check out the saved feature branch without resetting existing work. Use the repository-pinned pnpm 11.25.0 and a compatible Node version (Node 24 was tested here). If dependencies are already installed, do not reinstall unnecessarily. Otherwise, from the repository root:

   ```sh
   pnpm install --frozen-lockfile
   pnpm --ignore-workspace --dir mobile install --frozen-lockfile
   ```

2. In terminal A, at the repository root, start the local read-only fixture server:

   ```sh
   node scripts/run-device-preview.mjs --lan
   ```

   It listens on port 4324. `--lan` deliberately exposes only these synthetic fixtures to your private LAN; the default without that flag is computer-loopback only. Keep it off public Wi-Fi and do not configure router port forwarding or a public tunnel. Stop it with Ctrl+C when finished.

3. Find your computer's actual Wi-Fi IPv4 address. On Windows run `ipconfig` and use the Wi-Fi adapter IPv4 address. On macOS use System Settings → Wi-Fi → Details → TCP/IP; on Linux use network settings. Avoid Docker/VPN addresses. Example only: `192.168.1.20`. Replace it below with your actual address. `localhost`/`127.0.0.1` on a phone refers to the phone, not your computer.

4. On **both phones**, open Chrome/Safari at:

   ```text
   http://YOUR-COMPUTER-LAN-IP:4324/__device/health
   ```

   Expect JSON showing `fixtureOnly: true`, `databaseAccess: false`, `providerAccess: false` and `mutationsEnabled: false`. If it fails, check same Wi-Fi, client isolation and computer firewall access for Node on the private network. Do not disable the firewall globally. The fixture rejects cookies/Authorization; use a private browser tab if you previously stored cookies on that IP. Do not paste any real credentials into this server.

5. In terminal B, enter `mobile`. Set the two public API variables to the **same exact fixture origin**, then start Metro. These URLs are public configuration, not credentials. Do not use a production URL.

   **Windows PowerShell** (replace the example IP):

   ```powershell
   cd mobile
   $env:EXPO_PUBLIC_VETIT_API_BASE_URL = 'http://192.168.1.20:4324'
   $env:EXPO_PUBLIC_VETIT_TEST_API_ORIGIN = 'http://192.168.1.20:4324'
   $env:EXPO_NO_TELEMETRY = '1'
   node node_modules/expo/bin/cli start --lan --offline
   ```

   **macOS/Linux**:

   ```sh
   cd mobile
   EXPO_PUBLIC_VETIT_API_BASE_URL=http://192.168.1.20:4324 \
   EXPO_PUBLIC_VETIT_TEST_API_ORIGIN=http://192.168.1.20:4324 \
   EXPO_NO_TELEMETRY=1 node node_modules/expo/bin/cli start --lan --offline
   ```

   Leave terminal A running. Metro normally uses port 8081, separate from the fixture API's 4324. Allow only appropriate private-LAN access if your computer asks. No production credentials are needed for this preview. Session-only environment variables leave existing configuration files untouched.

6. **Android:** open the SDK-compatible Expo Go and scan Metro's QR code. **iPhone:** scan it with Camera/Expo Go if its SDK is compatible. Allow that app's local-network access if prompted. If a development-build/client mismatch appears, record BLOCKED; do not change dependencies or weaken transport security to bypass it.

7. On each phone, verify:
   - App opens; Home/Shop/Services/Cart/Account navigation works.
   - Shop displays “Synthetic device-test harness”, INR pricing and the expected fallback artwork. Search for a missing term and return to browse.
   - Add the synthetic product, increase/decrease quantity and remove it. This is an in-memory preview cart; a restart is not proof of saved-account persistence.
   - Services shows synthetic Veterinary, Grooming and Daycare listings. Try category/city Mumbai and Check availability; expect one fixture future slot. This is not a real provider schedule or distance-search acceptance.
   - English/Hindi toggle, text scaling, scrolling, tap targets and screen-reader labels remain usable.
   - Background/resume and network interruption show recoverable states. Never interpret unavailable/private features as a successful authenticated test.

8. Private APIs deliberately return 401, and writes return 405. Website handoffs display a fixture-only explanation. **Do not enter an OTP or attempt to create a real order/appointment.** The default Expo App entry does not construct the trusted `nativeModeration`/OS-protected session host. Its private native screens are conditional on that host; website sign-in or adding a URL cannot create it. Their absence in this preview is a known integration prerequisite, not evidence they passed or failed.

9. Expo Go uses its own installed app shell. It does not prove Vetit's signed launcher icon, signing, entitlements, install/upgrade or production push behavior. Record these as BLOCKED/NOT RUN until section 4 is ready.

## 3. Record what actually ran

Keep reports/screenshots locally under ignored `mobile/device-evidence/` (or another secure location). Do not put personal test data into Git. After selecting the exact commit used by the build, run from the repository root:

```sh
node scripts/device-acceptance.mjs --template > YOUR-PRIVATE-REPORT-PATH.json
```

On Windows PowerShell you can save UTF-8 without a BOM using:

```powershell
node scripts/device-acceptance.mjs --template | Set-Content -Encoding utf8 YOUR-PRIVATE-REPORT-PATH.json
```

The assessor accepts UTF-8 with or without a BOM, including Windows PowerShell output. Fill model/OS, `physicalDevice`, `buildKind` (`preview`, `signed-internal` or `local-native`) and the real `buildCommit`. Enter the fixture/test origin in both URL fields. Use `pass`, `fail`, `blocked` or `not_run` per case, with a non-secret evidence reference for a pass. Do not mark blocked work as pass. Recreate the record for a different commit instead of carrying old passes across builds.

```sh
node scripts/device-acceptance.mjs --file YOUR-PRIVATE-REPORT-PATH.json
```

A preview-only record must remain incomplete for the native/release cases. Even complete declarations never authorize hosted execution or a store submission and are not independent proof that a device was tested. Share case IDs, outcomes, model/OS and sanitized screenshots if needed; retain private raw evidence locally.

## 4. Signed/native testing: prerequisites and manual actions

Full authenticated acceptance needs engineering completion of a trusted native session host using approved Test authentication and OS-protected storage. It is not instantiated in the default Expo entry. Do not fake a token/session to reveal screens. Review the host/build composition before treating a binary as a private-workflow candidate.

**Android:** a signed internal APK can be installed without Play Store submission. A local Android/JDK/SDK build environment or an explicitly approved hosted build is needed. For an existing signing key, preserve it and its encrypted backup; never overwrite it. If you need a new key, first decide the custody/backup owner. Use the existing `com.vetitonline.app` identity and a new unused version code for each subsequent build. An APK/AAB is a build artifact, not source and not a store approval.

**iPhone:** a simulator is not physical-device acceptance. A Mac with Xcode can support local device builds subject to the selected Apple signing arrangement. Limited Personal Team development has capability/expiry restrictions and is not equivalent to distribution/push acceptance. Ad-hoc/internal distribution normally requires Apple Developer Program access, registered test devices, and matching distribution certificate/profile. If you only have Windows and incompatible Expo Go, a separately approved signed iOS build route is required; Safari is not a substitute. Register device identifiers through Apple's/your approved build service's private workflow, not public reports.

The prepared `mobile/eas.json` uses local credentials for `internal` and `release-candidate` profiles, requires a committed tree and has no submit profile. Real signing material is not present. Only after signing/build approval, copy the public template to ignored `mobile/credentials.json` and fill private values locally. Verify Team ID, app ID, certificate expiry, profile/device/distribution type and encrypted backups. Never commit or paste secrets. The offline shape checker is:

```sh
node scripts/check-mobile-signing-readiness.mjs --file mobile/credentials.json
```

It does not verify passwords/certificates or authorize signing. No EAS upload/build/submission command is requested by this runbook. Choose and approve that route first. Inspect the artwork on real signed home-screen/app-switcher icons and Android masks; the opaque square source is integrated, but Expo Go cannot validate the native result.

## 5. Approved Test backend and provider acceptance

Before a private/native test run, explicitly approve the exact HTTPS Test API origin, synthetic buyer/provider/seller/admin accounts, supported Test auth configuration, schema baseline/proposal artifacts and provider sandbox accounts. Never use `vetit.online` production. Update both public URL variables together for that approved origin. Use HTTPS for a signed native test build; do not globally disable iOS ATS or Android cleartext protection to make HTTP staging work.

Keep real payments, real recipients, hosted schedules and unapproved migrations disabled. Existing approval packages are `admin-backend-approval-checklist-2026-11-21.md`, `notification-release-approval-package-2026-11-22.md` and `icon-signing-provider-acceptance-2026-11-22.md`. Populate `provider-sandbox-readiness.example.json` declarations only alongside actual evidence; flags cannot grant approval.

On **each physical phone**, record:

| Case ID | Action and expected result |
| --- | --- |
| `native.auth_isolation` | Approved synthetic sign-in/session renewal; switch A→B/sign out while calls are pending; A's records must disappear and not return from late responses. Confirm OS-protected storage behavior. |
| `native.booking` | Review current price/policy, choose a returned slot, confirm once; fresh owner-bound records verify the booking. Changed price/slot must conflict safely. No real payment. |
| `native.cancellation_rescheduling` | Review saved policy, cancel eligible unpaid appointment; reschedule another to a listed replacement. Verify revision, time, service and unchanged agreed price after refresh. Refunds remain review-only. |
| `native.waitlist_offers` | Join/leave, receive a synthetic offer, inspect saved price/policy/expiry, accept/decline. Another account cannot take it; expired/changed offers fail; verify the linked booking and FIFO handoff in backend evidence. |
| `native.notification_readback` | Read/unread controls update only the owner's returned notification after readback. No raw clinical/contact payload in the native feed or screenshots. |
| `native.offline_background` | Airplane mode/reconnect, background/foreground and terminate after dispatch. Unknown results require read reconciliation; repeated taps must not auto-resubmit writes. |
| `sandbox.checkout_reconciliation` | Synthetic stock-backed quote/order and verified sandbox capture; test mismatched/late/duplicate evidence and reservation expiry. The default hosted order route remains disabled until separately approved. |
| `sandbox.delivery_reconciliation` | Named synthetic recipient only; verified accepted/rejected/pending/unknown evidence; lost finish response reconciles without another send. “Accepted” does not prove inbox/handset delivery. |
| `release.install_upgrade` | Install approved signed candidate, inspect icons and masks, upgrade with a new build counter, verify retained/cleared state and version identity. No store submission. |

Also test both platforms' accessibility/large text, India timezone, permission denial/revocation and deep-link account routing. Push/email delivery and signed termination behavior are BLOCKED until a separately approved real sandbox adapter/native permission setup exists. Attach safe evidence and backend reconciliation references, not credentials.

## 6. Fingerprint advisory and final decision

No dependency change was made. Fingerprint's minimatch advisory remains open; the previous investigation found it in build-tool ignore-pattern handling and absent from the inspected mobile source maps, which is not a fix or global absence proof. `pnpm check:fingerprint-inputs` now checks this repository's ignore patterns without invoking minimatch: bounded count/length/segments, no complex expansion syntax or escaping patterns, and explicit review if dynamic fingerprint config appears. This is a local-input guard, not a vendor patch; vendor defaults and other build inputs are not certified safe by it. Do not run untrusted project configuration alongside signing secrets. A compatible upstream fix or a separately reviewed upgrade remains necessary.

The next useful response from you is: device models/OS, computer OS/Mac access, Expo Go compatibility on each phone, and the public-preview case results. For signed/private acceptance, also choose the signing/build route and the exact approved Test target/provider accounts. No extra approval is needed just to read the runbook or run its offline assessors; the externally consequential steps above remain separate approvals.
