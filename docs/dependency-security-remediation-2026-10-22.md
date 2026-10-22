# Bounded dependency security checkpoint — 22 October 2026

Repository: `C:\Users\DELL\vetit-online`, branch `codex/development-readiness-2026-10-21`, starting HEAD `43a41e807ba2aa7d969f9cac1559a6a7ab0a709e`. All existing commits, frozen SQL packages, recovery branches, archives and untracked evidence are preserved.

## Alert evidence and exact changes

GitHub's last verified push notice reports four default-branch alerts (two high/two moderate), without IDs or manifest paths. Available connector tools do not expose Dependabot alert inventory. Dashboard authentication remains pending manual verification; it was not retried. Exact reconciliation/closure of those four alerts cannot be claimed. The prior root-lockfile audit separately identified eight advisories across three transitive packages; these confirmed local findings are the remediation baseline.

| Affected root dependency | Correction | Result |
| --- | --- | --- |
| Astro -> Vite 8.3.2 | Exact version-scoped override to 8.3.3 | Six Vite advisories no longer returned by root audit; framework and other toolchain versions retained |
| @astrojs/vercel -> @vercel/routing-utils 6.6.0 -> path-to-regexp 6.1.0 | Parent-scoped override to existing patched 6.3.0 | ReDoS advisory no longer returned; both routing-utils imports resolve the reviewed generation |
| Astro -> http-cache-semantics 4.2.0 | Pin existing version with pnpm-managed source patch | Tested disclosure path blocked; scanner still reports one high advisory by package version |

Root changes: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/http-cache-semantics@4.2.0.patch`, `.gitattributes`, and focused tests. `.gitattributes` forces LF for patch files so pnpm's byte hash survives Windows/Linux checkout. No direct `package.json` version changes, broad dependency upgrade, mobile manifest/lockfile change, environment/deployment configuration change or system-wide install. The lockfile updates Vite peer references and records patch SHA-256 `bbf1ef3c8683fc89914f630fcad6955e2678547ebcbfddefb76abbec181dbd80`; unrelated resolved package versions remain unchanged.

## Cache fix and residual risk

The registry reports cache >=4.3.0 as patched, while the [public advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) says no patched version. Exact npm 4.3.0 metadata and its tarball were checked against the registry SHA-512 integrity. Synthetic checks against both the installed 4.2.0 and verified 4.3.0 code reproduced reuse of private/no-store/no-cache/implicit-cookie responses under `max-stale`. Therefore 4.3.0 was **not installed** and its scanner status was not mistaken for a behavioral fix.

The local patch makes `evaluateRequest` return a synchronous cache miss before stale handling when the original request/response is not storable, the response requires revalidation, or a shared response carries Set-Cookie without the library's existing explicit public/immutable opt-in. It covers both `max-stale` and stale-while-revalidate entry paths. Ordinary public caching, permitted stale responses, explicit public-cookie caching and personal caches remain tested. This is a maintained downstream patch for the demonstrated behavior, not proof that every cache consumer or hosted session is secure. No advisory suppression or ignored-CVE configuration was added.

Keep the version pin and patch together. Do not replace with 4.3.0 or remove the patch just to clear an audit. Future removal requires a reviewed upstream fix, matching behavioral tests and lockfile review. Dependency upgrades must keep the patch applicable or stop on failure. Upstream source comparison: [registry gitHead source](https://github.com/kornelski/http-cache-semantics/blob/b1d4bd682fbab0252985de45219f4e7497c0067c/index.js). The inspected `v4.3.0` release URL was unavailable (404); no release note was invented.

## Executed validation

- `pnpm install --lockfile-only --ignore-scripts`, reviewed exact diff, then `pnpm install --frozen-lockfile --ignore-scripts`: passed with the existing pnpm 11.25.0, project-local only. No lifecycle scripts, global tools or package-manager upgrade.
- `node --experimental-import-meta-resolve --test --test-isolation=none tests/dependency-security.test.mjs tests/local-ssr-node-resolution.test.mjs`: **10 passed** (six new security/routing checks and four existing runtime checks repeated because Vite changed). Covers cache denials/positive controls, Vercel parameter routes, an adversarial regex in a time-bounded worker, exact Vite resolution, conditional ESM/CommonJS and missing-package behavior.
- `pnpm audit --json`: **one high cache advisory remains**, versus eight before; exit 1 is expected. No low/moderate/critical findings in this root audit. Version-based audit cannot inspect the patch; neither clean scanner status nor GitHub alert closure is claimed.
- `ASTRO_TELEMETRY_DISABLED=1 pnpm run build`: passed using existing production configuration; generated local output only, no deployment.
- One local HTTP SSR smoke using existing `astro.local.config.mjs`, fixed loopback port 4337, isolated env directory and empty Supabase public configuration: home/products/services/cart/login each returned 200; home contains four shortcuts and English markup; no `require is not defined` error. Server stopped afterwards. This is not a responsive browser, authenticated session or physical-device acceptance run. The first smoke harness used an absolute config path that Astro joined to the root and rejected; the corrected root-relative harness passed. Both diagnostics remain in separate evidence.
- Patch LF/hash check and `git diff --check`: passed. Existing unrelated product/mobile/SQL suites were not repeated; mobile inputs are unchanged and none of these three dependency names appears in its separate lockfile.

Private evidence remains local under `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\dependency-remediation-20261022`: candidate integrity/behavior evidence, post-change audit, runtime smoke and final hash/synchronization receipts. Raw evidence/tooling/generated output is excluded from the commit.

## Remaining actions and approvals

Provide a redacted export of the four GitHub alerts (GHSA, package, manifest path, affected range and state) when accessible; no further sign-in retries are needed now. The remaining cache alert requires continued downstream-patch maintenance and a verified upstream correction before closure. Vite 8.3.3 fixes are scoped to documented advisories, not a general penetration-test certification. Default-branch alerts will not necessarily change from a development-only push.

Authenticated Test backup project/reference, successful timestamp, retention/PITR range, reviewed restore procedure and separate Storage-object coverage remain missing. No local source ZIP or synthetic test database establishes hosted/production backup readiness. This remains manual pending, not a local development blocker.

Atomic catalogue revision protection remains the next application milestone under its existing documented migration/client-cutover plan. Hosted SQL/migration/restore, production configuration and any deployment/promotion require separate explicit approval. No such action occurred here. A normal development push may create the previously accepted automatic Vercel Preview; no deployment command or main/recovery-branch update is part of this batch.
