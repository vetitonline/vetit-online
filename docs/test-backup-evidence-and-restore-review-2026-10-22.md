# Test backup evidence intake — pending manual verification

Owner direction, 22 October 2026: dashboard authentication is pending manual verification, not a local development blocker. Do not retry authentication until new access/evidence is supplied. Genuine backup evidence remains a prerequisite for hosted corrections. No dashboard retry occurred in this seller development batch.

## Fresh read-only recheck after reported authenticated metadata availability

The connected task browser inventory contained only the existing sign-in tab; the connected MCP Apps surface had no tabs. Direct navigation to the exact Test backup URL briefly rendered a loading shell with undefined project/sidebar links, then redirected to Supabase sign-in. That shell is not authenticated project/backup evidence. The existing GitHub continuation again requested username/password; no credentials were entered or permissions accepted. No other authenticated backup view is exposed to this task. Stop this access workflow until the owner completes authentication in the connected task browser or attaches the actual authenticated tab/metadata source.

The connected read-only project metadata tool reconfirmed `apfyfmokcynqiaxqvvxx`, **Vetit Online Test**, eu-west-1, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003. Its authenticated project lookup still contains no backup records, retention settings or recoverable timestamps. Dashboard authentication is separate from connector authorization. No hosted SQL was executed to work around this limitation.

No genuine backup status/reference, successful timestamp, observed retention or PITR recovery range could be read in this recheck. Those fields remain unknown and `verified=false`; nothing was inferred from public backup documentation, a loading page, project health or synthetic receipts. The restore checklist below is available preparation, not a verified project-specific restore procedure or successful restore drill. Storage-object recovery and custom-role credential recovery remain unverified too.

Only audit documentation changes in this recheck. Existing tests/payloads/code are unchanged, so no test suite was repeated. No restore, migration, configuration/deployment change, resource deletion or backup-branch update occurred. The exact remaining manual action is authentication in the connected Test backup browser session, or provision of the actual authenticated tab/redacted metadata source and reviewed restore procedure. Do not send credentials or database contents.

Exact project identity was confirmed read-only by the connected project metadata tool: **Vetit Online Test**, `apfyfmokcynqiaxqvvxx`, eu-west-1, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003. Healthy project metadata is not backup evidence and does not establish plan/retention/backup availability.

## Actual access result

The exact [Test Database > Backups page](https://supabase.com/dashboard/project/apfyfmokcynqiaxqvvxx/database/backups) redirected to Supabase sign-in. Its existing GitHub sign-in route also reached a username/password login page: this browser has no usable authenticated dashboard/GitHub session. No credentials were entered, accounts created, OAuth permissions granted, backups started or restores attempted. The connector's project response includes no backup records, timestamps or retention settings, and no callable backup-list tool is exposed. The backup workflow is stopped until authenticated access/evidence is supplied; repeated unauthenticated visits add no evidence.

Saved recovery evidence contains only explicit **backupVerified=false** receipts and proposed restore prerequisites. No authenticated backup artifact has been found in the reviewed saved evidence. Local ZIPs, package hashes, synthetic ledger entries and PostgreSQL rollback/concurrency tests are not hosted backup evidence. Existing records outside the reviewed evidence locations remain unknown; no broad search of private laptop folders was performed.

## Exact owner action and missing fields

Sign in to the exact Test backup page in the task's browser session, including MFA if required, or provide redacted metadata captured from an authenticated dashboard/authorized read-only Management API response. Do not send passwords, API tokens, database connection strings, downloadable database contents or personal records. Creating new tokens/access, enabling paid backups, dumping databases or running restores is not authorized by this review.

Capture the project identity alongside actual backup status, reference and successful timestamp; observed plan/backup availability; retention setting; inspection timestamp; and display timezone. If PITR is enabled, capture earliest/latest recoverable points and the intended recovery target. Record absence/failure faithfully if there are no successful backups. Unknown values remain null, not guessed from a subscription tier or public documentation.

Copy `docs/templates/test-backup-evidence.template.json` to a new private evidence location outside Git. It is an intentionally incomplete template, not an observation or attestation. Keep `verified=false` until the authenticated source and restore prerequisites are independently reviewed. Normalize evidence timestamps to complete UTC ISO strings ending in `Z`, preserving the displayed timezone separately. References should point to private reviewed metadata/procedure artifacts; do not include secrets in them. Structured field checks alone cannot authenticate an artifact or prove a restore works.

The offline review builder's conservative proposed gates remain: successful backup within 24 hours, inspection within one hour, retention at least 24 hours, and independently reviewed evidence/restore references. No unavailable or stale evidence is converted into a passing record. If an actual project's recovery policy differs, review that policy explicitly instead of bypassing the gate.

## Restore procedure review — no execution approval

Review [Supabase Database Backups documentation](https://supabase.com/docs/guides/platform/backups) together with the authenticated project settings. Record backup type, recovery point, exact destination project, expected data-loss window and downtime, required operator role, and owner approval boundary. Determine whether a separately approved isolated restore drill is available and what post-restore identity/ledger/RLS/role acceptance it would require. Do not click Restore or start a new project as part of evidence collection.

Database backups cover database data and Storage metadata, **not Storage object bytes**. A separate object recovery plan is needed for marketplace photos; a database restore cannot recover deleted objects. Daily backups also do not retain custom-role passwords, so their secure recovery/rotation procedure must be reviewed without putting credentials in this repository. Public documentation says project access is interrupted during restoration; exact downtime and recoverability remain unverified here. Any subscription/replication-slot requirements must be reviewed before a separately approved restore, without dropping or recreating anything now.

Public backup availability differs by plan and PITR configuration. This review does not infer the Test plan, enable backups or claim a successful backup from those product descriptions. The official docs describe a read-only Management API backup-list endpoint, but this session has neither a callable backup-list connector nor authenticated dashboard access; no token was extracted or API request improvised.

## Independent prerequisites prepared

- r2 apply/pause remains execution-disabled. Security-preserving pause retains stronger functions, validation/moderation guards and RLS; weaker r1 reversal remains prohibited.
- Atomic schema-plus-ledger/replay/drift handling is locally tested for the two r2 actions only. The frozen fourteen-step wrapper-aware executor and partial-release recovery/provenance review remain separate gates.
- Exact Test connection, fresh approved ledger/schema comparison, residual creator/service-role privileges, role/session/Storage acceptance and physical devices remain unverified. No hosted SQL was run in this batch.
- Current local hardening rejects non-finite clocks/retention, type coercion, empty/non-string evidence references and impossible normalized dates. These checks validate structure, not authenticity. No unchanged SQL, build, install or broad suite needs repeating for this metadata-only change.

Next approval is not migration execution. First obtain genuine backup metadata and review the restore procedure; then separately authorize fresh read-only hosted prerequisite reconciliation. Hosted application, backup creation, restore/drill, deployment and production changes each remain explicitly unapproved.
