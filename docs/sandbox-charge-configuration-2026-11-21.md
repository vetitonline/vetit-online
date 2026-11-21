# Sandbox checkout configuration — not activated

`createSandboxChargeProviders` is a server-only synthetic shipping/tax source for the existing `createCheckoutRateIssuer`. It requires `approved: true` and an explicit policy; it does not read environment variables or credentials, install an HTTP route, register scheduling or enable the hosted checkout runtime.

Required policy fields:

| Field | Sandbox interpretation |
| --- | --- |
| `reference` | Versioned synthetic policy identifier, 1–80 safe reference characters |
| `postalPrefixes` | 1–100 distinct India PIN prefixes, 3–6 digits; unsupported PINs fail closed |
| `deliveryPerSellerMinor` | Nonnegative INR minor units, charged once per distinct database-backed seller |
| `taxBasisPoints` | Explicit synthetic tax rate, 0–10000 basis points |
| `taxShipping` | Explicitly include or exclude delivery in the synthetic tax base |
| `quoteTtlSeconds` | Provider quote lifetime, 31–900 seconds |

These are synthetic staging values, not statutory GST rules or live carrier rates. There are no default prices or assumed legal rates. Taxes round half-up in integer minor units using BigInt. Calculations check the independently normalized cart and database-backed item quantities, prices and seller IDs; totals cannot be overridden with browser claims. Configuration is copied at construction so later changes to the input object cannot silently alter an active provider. Each quote carries a unique versioned sandbox reference and bounded expiry.

Trusted composition after explicit staging approval:

1. Construct the providers with a reviewed synthetic policy.
2. Pass them to `createCheckoutRateIssuer` with a service-only database worker and explicit reservation policy. Bind the authenticated customer on the server, never from the request body.
3. Use the issued immutable quote ID with `createPostgresOrderRepository` on the customer's authenticated client. `createCheckoutOrder` rechecks current product data and the reviewed total; PostgreSQL atomically checks quote ownership, expiry, seller/price basis and stock.
4. Pass the existing sandbox lifecycle worker's payment adapter to the order service. Reconcile using independently verified sandbox evidence. An API order response or browser payment flag never marks an order paid.
5. Preserve the same quote/idempotency key after an unknown result. Do not automatically create another order/payment. The current replay path returns the existing order without preparing another payment.

The isolated PostgreSQL end-to-end test exercises this composition through configured charges, rated quote issuance, authenticated atomic order creation, idempotent replay and verified payment reconciliation. Existing suites cover overselling, rollback, expiry, customer isolation, seller roles and admin visibility. Appointment SQL tests separately cover booking/cancellation/rescheduling/FIFO offers, including daycare resources and payment-review records; no charge or refund is executed.

Approvals still needed: exact staging target and pending SQL proposals; synthetic shipping/tax and reservation policies; provider sandbox credentials/adapters and hosted Auth/RLS acceptance; separate approval for any hosted deployment or scheduling. Real shipping/tax treatment, notification delivery, refunds, native customer booking controls, device/store acceptance and dependency remediation remain launch work. The admin approval package remains in `docs/admin-backend-approval-checklist-2026-11-21.md`. No live database, payments, configuration, credentials or hosted ordering/scheduling were changed.
