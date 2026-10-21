# Vetit Online Test — frozen local versioned release r1

**Generated and reviewed locally; NOT approved or ready for hosted execution.**

Repository: `C:\Users\DELL\vetit-online`; branch `codex/development-readiness-2026-10-21`; freeze-time source HEAD `5d969487f47f6c84d7404d5c0ef35c75caf7dd3f`. The application cohort is now committed at `aee37def06a23eb0515fedf58417d949175eb2f3`, SQL safeguards at `8e492f40d3c3012fb026d5912226b1ba9a8c0712`, and this fourteen-migration release/draft at `fa0d747fb38ea7f1ef02885bdab5eb4581f60e19`. They remain local only: no push, application, linking or deployment occurred. The protected remote recovery checkpoint is unchanged; it does not contain this release or the newer local development commits.

## Exact payload

`release-manifest.json` maps every CLI-generated version to its frozen original source and source/payload SHA-256. Fourteen versions are unique and increasing. Every payload equals the original source bytes; foundation sources were also rechecked and preserved, with none included for replay. Step 14 includes authenticated self-profile repair. Optional grant assertion remains excluded: core step 3 already creates fulfilment_events with explicit authenticated participant SELECT and RLS.

| Step | CLI version | Generated migration |
| --- | --- | --- |
| 1 | 20261021133609 | `supabase/migrations/20261021133609_vetit_test_01_seller_variant_key_count.sql` |
| 2 | 20261021133612 | `supabase/migrations/20261021133612_vetit_test_02_booking_participant_rls.sql` |
| 3 | 20261021133614 | `supabase/migrations/20261021133614_vetit_test_03_vetit_buyer_cart_inventory_fulfilment.sql` |
| 4 | 20261021133617 | `supabase/migrations/20261021133617_vetit_test_04_vetit_service_booking_transaction.sql` |
| 5 | 20261021133619 | `supabase/migrations/20261021133619_vetit_test_05_appointment_lifecycle.sql` |
| 6 | 20261021133622 | `supabase/migrations/20261021133622_vetit_test_06_appointment_operations.sql` |
| 7 | 20261021133625 | `supabase/migrations/20261021133625_vetit_test_07_vetit_seller_rejected_resubmission.sql` |
| 8 | 20261021133627 | `supabase/migrations/20261021133627_vetit_test_08_vetit_admin_listing_queue.sql` |
| 9 | 20261021133630 | `supabase/migrations/20261021133630_vetit_test_09_vetit_durable_moderation.sql` |
| 10 | 20261021133632 | `supabase/migrations/20261021133632_vetit_test_10_vetit_low_risk_automatic_approval.sql` |
| 11 | 20261021133635 | `supabase/migrations/20261021133635_vetit_test_11_vetit_service_storage_boundaries.sql` |
| 12 | 20261021133637 | `supabase/migrations/20261021133637_vetit_test_12_business_scoped_moderation.sql` |
| 13 | 20261021133640 | `supabase/migrations/20261021133640_vetit_test_13_seller_price_validity.sql` |
| 14 | 20261021133642 | `supabase/migrations/20261021133642_vetit_test_14_authenticated_profile.sql` |

No combined execution script is supplied. All fourteen sources retain their explicit BEGIN/COMMIT wrappers. They cannot be treated as one atomic outer transaction; executor/ledger/timeout and partial-failure behavior need review before hosted approval. No transaction wrappers or frozen SQL were rewritten for packaging.

## Verified tool and isolation

Official Supabase CLI **v2.121.0**, Windows AMD64, is installed outside the repository at:
`C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\tools\supabase-2.121.0\supabase.exe`.

Archive SHA-256: `bc0f27a29c1f4ccaf33a801b7cb9d10da6484568c88e232c9dea0b9e8666b0db`. It matches the official checksums.txt entry for `supabase_2.121.0_windows_amd64.tar.gz`; the release download alias uses an unversioned archive filename. Installation receipt beside the binary records both packaged executable hashes. Global PATH, dependency manifests and lockfiles were not changed.

The first version probe was blocked by the sandbox when the CLI attempted default user-profile telemetry-state initialization. Subsequent commands used the documented separate `SUPABASE_HOME` under the tools directory, `SUPABASE_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1` and an empty process-scoped access token. No login/link command or hosted database operation was run. The isolated CLI home has no access-token file; the release has no project link metadata. Only version/help and `migration new` commands were used. `generation.log` preserves generation output.

## Remaining release blockers

The 21 October read-only hosted preflight remains the latest baseline: exact Test project apfyfmokcynqiaxqvvxx, four foundation migrations, old JSONB variant error and broad booking participant policy, missing recovered appointment/moderation/service/commerce/profile interfaces. This package has not fixed the hosted project.

1. Approved aggregate-only data prerequisites remain outstanding: duplicate default addresses/base cart lines/payment references, invalid payment parents, order component/line totals, multiple bookings per slot, future resource overlaps and historical held-slot reconciliation. Return counts only, no personal rows. Do not clean data or invent ownership.
2. Review residual service_role non-CRUD privileges and creator-dependent defaults. Preserve explicit public-schema grants together with participant/owner/admin RLS, legal-name column restrictions, private schemas and Storage boundaries. Do not add blanket anon/authenticated grants or assume BYPASSRLS supplies SQL privileges.
3. Review exact executor against the fourteen transaction wrappers, lock/statement timeouts, migration-ledger updates, stop-on-error/partial-application handling and a verified Test backup/restore procedure. Confirm no ledger or source drift immediately before any eventual application. No default-directory db push or old six-source executor.
4. Separate approval is required for applying this exact immutable package to Test. No production, Vercel, scheduler/payment/notification/reviewer/legal-policy provisioning or automation activation is included.
5. Hosted Auth/session/role/Storage and cross-business denials, profile replay, listing transitions/child immutability and concurrency/idempotency/retry/crash acceptance remain unverified. Device/OS-protected storage, ordinary adapter-backed runtime and production-font checks remain open. Client profile-RPC initialization remains deferred.

The detailed GRANT/RLS/prerequisite review is preserved in `../../release-preparation-20261021/README.md` and `../../release-approval-20261021/README.md`. The October 30 grant requirement is addressed through explicit intended exposure, not broad defaults.

## Laptop/Codex resumption

Continue only in this same laptop repository and Codex workspace. From iPhone, first verify the session still has laptop filesystem access; chat visibility alone is insufficient. If unavailable, pause edits rather than cloning or generating another checkout.

1. Verify repository root, branch, HEAD and full working tree with read-only Git commands. Expected current HEAD is above; all earlier untracked archives/features must still be present.
2. Read `docs/development-handover-2026-10-21.md`, this file and the release manifest. Verify `validation-receipt.json` and source/payload hashes before any further action.
3. For future CLI use, explicitly set the isolated SUPABASE_HOME and telemetry opt-outs above; use the absolute installed binary path and an explicit workdir. No global PATH setup is required. Do not login, link, push or execute SQL as a resume step.
4. Keep local tools/archive/checksum receipts and separate validation evidence outside Git. Reviewed migrations, manifests, draft and documentation are committed locally; raw generation logs and excluded recovery material remain local/untracked. The scoped commits were separately approved and created; any remote push still requires explicit approval.

**Next approval requested:** fresh read-only aggregate Test data prerequisites and execution/backup metadata review, without sensitive row contents, accounts, SQL writes or migration application. After that, present the exact package/executor/backup for a separate hosted execution decision.
## Executor draft follow-up
See docs/test-release-checkpoint-2026-10-21.md and executor-draft.json. The offline generator has no execution path. Backup dashboard inspection reached sign-in; backup verification remains blocked. generation.log is retained locally and excluded from Git as raw tool output. Frozen SQL and release-manifest bytes remain unchanged; .gitattributes preserves them in Git.
