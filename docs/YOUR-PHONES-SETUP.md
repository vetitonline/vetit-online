# Your Galaxy A15 and iPhone 16 Pro Max: installation and test steps

## Your devices

| Phone | Safe compatibility assessment | First installation route |
| --- | --- | --- |
| Samsung Galaxy A15, SM-A155F/DSN | Reported Android 16 is above the installed framework’s API-24 lower bound; this is not physical-device certification. | Official Expo Go **matching project SDK 57**, if available; otherwise an approved internal APK. |
| iPhone 16 Pro Max, iPhone17,2; reported iOS 27.2.1 | Reported iOS is above the installed React Native 0.86.3 framework's iOS 15.1 lower bound. This does not certify Expo Go, the final build target or iOS 27 behavior. | SDK-matching Expo Go only if supported by the installed client; otherwise an approved signed physical-iPhone build. |

The framework source also contains an Android API-24 minimum hint, but final Expo/client/build requirements can be higher. No binary was installed on either phone remotely. Official Expo client metadata could not be fetched from the cloud environment, so SDK-57 client availability has **not** been verified. Do not upgrade the project, downgrade a phone or install an unofficial package to bypass an SDK mismatch.

## 1. Confirmed setup

The installed Expo **57.0.33**, React Native **0.86.3** and React **19.2.3** match Expo’s installed SDK-57 bundled-module manifest. This verifies package alignment, not client availability or physical-device behavior.

Your computer is **Windows**, your Galaxy A15 runs **Android 16**, your iPhone reports **iOS 27.2.1**, and you have an **Apple Developer account**. You do not need a Mac for Expo Go or an approved EAS cloud-signed internal build. Windows cannot run Xcode locally.

Do not send phone numbers, serials, IMEIs, SIM data, passwords or device UDIDs in chat. An Apple Developer account does not authorize a cloud build or prove compatibility with your installed OS.

## 2. Start the safe public preview on your computer

Use the computer on the **same trusted private Wi-Fi** as both phones. A cloud workspace's localhost/private address is not your home computer. If necessary, clone the feature branch into a new unused local folder; never overwrite/reset an existing checkout:

```sh
git clone --single-branch --branch codex/marketplace-accounts-2026-11-06 https://github.com/vetitonline/vetit-online.git vetit-phone-test
cd vetit-phone-test
```

If dependencies are not installed, use the repository-pinned pnpm and a compatible Node version (Node 24 was tested):

```sh
pnpm install --frozen-lockfile
pnpm --ignore-workspace --dir mobile install --frozen-lockfile
```

In PowerShell at the repository root, run `ipconfig`. Find the IPv4 address for the Wi-Fi adapter actually connected to your private network. Replace the example below with that address:

```powershell
node scripts/start-phone-preview.mjs --host 192.168.1.20
```

This starts both the read-only synthetic fixture API and Expo Go Metro preview, using session-only environment settings. No config file is edited, dependency installed or hosted backend contacted by the launcher. The API rejects credentials and all writes. Keep the terminal open; Ctrl+C stops its child processes. For a dry run, add `--check`. SDK 57 offline mode already selects LAN; do not add `--lan` alongside `--offline`.

In Chrome on the Galaxy and Safari on the iPhone, open `http://YOUR-COMPUTER-WIFI-IP:4324/__device/health`. Expect `fixtureOnly: true`, `databaseAccess: false`, `providerAccess: false`, `mutationsEnabled: false`.

Allow Node through Windows Firewall **on private networks only** if prompted (normally ports 4324 and 8081). Do not disable the firewall globally or use a public tunnel. If unreachable, check Wi-Fi/guest isolation; turn off a VPN only if your own network policy allows it. Do not use `localhost` on a phone. A private browser tab avoids unrelated cookies on that IP.

## 3. Galaxy A15 installation

1. Keep the reported Android 16 installation; no OS change is required for this preparation.
2. Use the official Expo Go source at `https://expo.dev/go` to determine SDK-57 Android client availability. Use Play Store only if that client supports SDK 57. Do not use third-party APK mirrors.
3. Open the SDK-compatible Expo Go and scan Metro's QR code.
4. If an incompatible SDK/development-client message appears, stop and report the exact message. Do not update project dependencies or lower Android security settings to bypass it.
5. Once open, perform the public smoke tests in step 5. If no compatible Expo Go is available, an approved internally signed APK must be built first. No ready-to-install APK or signing key is included in this repository.

## 4. iPhone 16 Pro Max installation

1. Open the official Expo Go client (App Store app ID `982107779`) if installed. Its installed SDK support must match SDK 57; a recent iPhone/iOS version alone is insufficient.
2. With the preview terminal running, scan Metro's QR code using Camera/Expo Go. Allow that app's local-network access if prompted.
3. If SDK 57 is unsupported, mark the native preview **BLOCKED**. App Store Expo Go normally supports only the current SDK; do not try unsigned IPA downloads, sideloading services or changing phone OS to work around it.
4. On your Windows computer, the fallback is an **EAS internal/ad-hoc physical-iPhone build**, using your Apple Developer account and an Expo account. It requires separate build/signing approval, device registration through Expo’s private registration flow, and signing credentials managed privately. No App Store submission is needed. No build has been requested here. The EAS build image must support the required SDK/toolchain and your reported phone OS; that remains to be checked before authorizing a build. The default preview also lacks the private session host, so signing it alone will not unlock authenticated bookings.

A local alternative is a signed physical-iPhone build. A Mac/Xcode version supporting your phone OS and a suitable Apple signing arrangement can support local testing. Ad-hoc/internal distribution normally needs Apple Developer Program access, registered test devices and matching certificate/profile. Windows alone cannot run Xcode; an approved hosted/internal build route would be required if no suitable Mac is available.
5. Do not send Apple passwords, certificate files or UDIDs in chat. No App Store submission is needed for an approved internal test, but signing/build setup must happen first. The prepared EAS profile does not itself produce an IPA.

## 5. What to test now

On each phone that opens the public preview:

1. Navigate Home, Shop, Services, Cart and Account.
2. Find “Synthetic device-test harness”, add it, change quantity and remove it. It is not a real purchase or saved-account cart test.
3. Find the synthetic Veterinary, Grooming and Daycare listings; check fixture availability.
4. Check English/Hindi, larger text, scrolling, button taps, VoiceOver/TalkBack and background/resume.
5. Capture sanitized case results, any error and the phone model/OS. Do not enter real credentials, OTPs or payment details. Stop both computer servers with Ctrl+C when finished.

The default Expo entry is a public preview. It does not construct the trusted OS-protected native session host needed for private account/booking controls. Website sign-in cannot manufacture that host. Full booking, rescheduling, cancellation, waitlist offers, private notifications and payment/delivery acceptance must remain **NOT RUN/BLOCKED** until an approved Test-host build and backend are supplied. Expo Go also cannot certify Vetit's signed launcher icon, signing, upgrade or push behavior.

## 6. Prepare the device-specific evidence file

From the repository root, create a private results folder if needed and generate the record (defaults now include Android 16):

```sh
New-Item -ItemType Directory -Force mobile/device-evidence | Out-Null
node scripts/prepare-known-phones.mjs --record | Out-File -Encoding utf8 mobile/device-evidence/YOUR-PRIVATE-PHONE-RESULTS.json
```

Use `--android-version` only if your reported OS changes. The record already contains your public model names and reported iOS version, but all tests are `not_run`; build commits remain blank until you identify the actual installed build. It contains no unique phone identifiers. Use UTF-8; the assessor accepts a PowerShell UTF-8 BOM.

Fill actual results/evidence, then check:

```sh
node scripts/device-acceptance.mjs --file mobile/device-evidence/YOUR-PRIVATE-PHONE-RESULTS.json
```

Keep reports and screenshots under ignored `mobile/device-evidence/` or another private folder. Preview passes cannot stand in for authenticated or signed acceptance. For later signing, hosted and provider acceptance, follow `ANDROID-IPHONE-TESTING.md` sections 4–6 and the existing approval packages. No signing upload, hosted migration, deployment, real payment or store submission is authorized by these instructions.
