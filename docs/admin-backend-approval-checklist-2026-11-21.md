# Admin backend approval package — not applied

Prepared migration: `supabase/pending-migrations/20261121170000_admin_order_overview.sql`.
SHA-256: `a53df8e08031f6591b8026cc48a42fb0e83d24419276fbcbddbd7db56a196100`.
This file matches the isolated-tested proposal byte-for-byte. It is intentionally outside `supabase/migrations`, so normal migration discovery cannot apply it. No hosted target has been contacted or approved by this work.

## Review before approval

- Confirm the exact target project/environment and its current baseline. If this function already exists, inspect its definition before choosing an additive follow-up; do not overwrite it blindly.
- Confirm the function owner and default privileges in the target. The function must execute with sufficient read permission on orders, use the fixed `pg_catalog, public` search path, and retain its explicit verified `auth.uid()` and trusted `app_metadata.vetit_admin` checks. User metadata is never authority.
- Review the exact projection: order UUID, status, market, currency, timestamps and subtotal/delivery/tax/total. No customer identity, contact/address snapshots or payment/provider evidence is included.
- Confirm SELECT-only behavior, no table grants or RLS policy changes, no effect on order creation, payments or scheduling. PUBLIC and anonymous execution are revoked; authenticated execution still requires the internal admin check.
- Approve a staging-only application first, including backup/recovery ownership and the migration artifact hash. Production application requires a separate explicit approval after staging acceptance. No unrelated pending proposals are bundled with this function.

## Hosted staging validation after explicit approval

Use synthetic accounts/orders only. Authenticate through normal Supabase Auth; never expose service-role credentials to a browser/mobile client.

1. Confirm schema-cache visibility of `get_admin_order_overview` through PostgREST. Missing function must produce the application's sanitized unavailable state, not a privileged fallback or a misleading empty success.
2. Verify anonymous execution is denied; unauthenticated API requests return 401; ordinary buyer/seller accounts return 403 even if they set `user_metadata.vetit_admin`. Confirm forged query/body roles and stale/untrusted tokens do not grant access.
3. With an explicitly provisioned trusted admin test account, verify list access through `/api/admin/orders` and `/admin/orders`. Test both cookie and native bearer transport. Validate authenticated identity is still required if a token has an admin claim but no subject. Verify claim revocation after session/token refresh using the target's actual Auth configuration.
4. Traverse more than one page, including identical/microsecond timestamps. Verify no duplicates/gaps, bounded limit (1–50), correct older-page cursor and refresh to latest. Check malformed cursors and `orderId` are rejected. Non-GET requests must not mutate anything.
5. Inspect browser/network/cache output for customer identifiers, addresses, contacts, payment references and raw SQL errors; none should be returned. Confirm private/no-store headers and no user-specific data in static assets or shared caches.
6. Recheck existing buyer ownership and seller business membership using those accounts directly under RLS. The function must not alter table policies or permit any order UPDATE/INSERT/DELETE, including by admins through the normal authenticated client.
7. Verify English UI, narrow mobile viewport, keyboard navigation, unavailable/forbidden/login states and native API response compatibility.
8. Confirm hosted ordering, real payments, cron/scheduling and notifications remain disabled. Record acceptance evidence, approver, target and artifact hash before any production request.

## Stop conditions

Unexpected data, grants, owner, baseline or claim behavior blocks promotion. Do not work around failures with a service key in the application. Disable access through a separately approved permission change if required; preserve order records and do not drop tables or reset the project.

## Adjacent appointment/checkout readiness

Web and native provider appointment commands now send the dashboard/session account as `x-vetit-profile-id`; API rejects missing/changed accounts with 409 before any command RPC. Existing revision, provider-role, slot, policy and FIFO checks remain authoritative in PostgreSQL. Older clients must be updated before any approved API rollout. Appointment cancellations and rescheduling produce payment-review records, not automatic refunds or charges. Native customer mutation UI, real provider adapters, approved policy/rates, notification delivery, job registration, refund operations and hosted acceptance remain release gates. The local appointment runner uses a dedicated network-isolated PostgreSQL container and never accepts a hosted database URL.
