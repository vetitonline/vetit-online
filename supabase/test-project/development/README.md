# Forward-only development proposals

These files are outside both the root migration directory and the frozen r5 recovery candidate. They are NOT applied to hosted Test or production, and are not generated/versioned release migrations.

Prerequisite: the normalized four-entry foundation and the existing thirteen-step r5 correction composition, in its reviewed order. Keep historical SQL and source hashes intact. The saved variant-key and price replacements, scoped guard and durable moderation implement the variant/transition/parent checks; do not replay older definitions after them.

1. `data-api-grants.proposal.sql`: idempotent authenticated SELECT for `fulfilment_events`, conditional on its existing RLS and named participant policy. This makes a future recreation's exposure explicit. The current canonical candidate already grants this, so it is optional normalization, not a newly discovered missing grant. No anonymous grant, blanket schema/default grant, policy alteration or service-role table grant is added.
2. `authenticated-profile.proposal.sql`: new `ensure_my_profile()` for authenticated older accounts missing their profile. Resolves the caller from `auth.uid()` and an actual Auth record; has no user-ID/role argument. Inserts only the caller, with the table's customer role default, bounded string display name and Auth-controlled phone. Replays preserve every existing profile field/role. PUBLIC, anon and service_role execution revoked; authenticated execution explicitly granted; empty search_path. Existing signup trigger is preserved.

The profile RPC is intentionally not invoked automatically by current clients: hosted Test does not have it. After separately approved release and real session/role acceptance, add explicit shared web/mobile profile initialization before profile-dependent writes. Do not mask missing RPCs with insecure direct inserts, user-metadata roles or anonymous fallback.

Local validation used the retained synthetic database `vetit_disposable_corrections_20261020_1902`, loopback `127.0.0.1:55432`, in one outer rollback-only transaction. Both proposals were replayed twice. Three groups passed: signup/customer-role isolation and missing-profile/replay; typed variants, denied direct submission and child movement out of/into submitted review (including images); explicit participant read grant without anonymous access. Only a just-created synthetic profile was removed inside that rolled-back transaction to model an old account. Existing fixture data and schema were not persistently changed.

Tests: `tests/development-backend-security.sql`. Evidence: `C:\Users\DELL\.codex\visualizations\2026\10\20\01a158a4-4a1d-7bb2-9119-365e6b275fa7\development-pass-20261021\reviewed-boundaries.sql` and `.log`. Synthetic Auth/Storage are not hosted Supabase acceptance.

Next release steps require exact CLI-generated versions, dependency/executor review, fresh approved Test data preconditions and backup/recovery approval. No host, policy/reviewer provisioning, scheduler/payment activation or production changes are authorized by these proposals.
