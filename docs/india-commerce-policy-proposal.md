# India commerce policy proposal (decision document)

Status: **proposal only**. No values in this document configure the live application. Checkout creation, payment capture, stock reservation and refunds remain disabled until business, finance, legal and security owners approve the relevant decisions and the backend transaction design is tested.

## Decisions required before transactional checkout

| Area | Questions requiring an owner decision | Safe implementation boundary |
| --- | --- | --- |
| GST/tax | Which registered seller/entity is merchant of record? Are displayed prices tax-inclusive? What product/service classifications and place-of-supply rules apply? Who maintains effective-dated rates and exemptions? How are invoices/credit notes numbered and retained? | Obtain India tax/legal review. Store effective-dated, auditable tax rules and classification references server-side. Never accept a tax amount/rate from web or mobile. Do not hard-code one rate across marketplace categories. |
| Delivery | Which carriers/fulfilment model, serviceable postcodes, weight/dimension inputs, fees, free-delivery thresholds, remote-area surcharges and delivery promises apply? Who funds failed delivery/returns? | Start with an explicitly versioned serviceability/quote contract. Calculate server-side from validated address and shipment facts. A quote must expire and identify its policy version. No delivery promise without carrier/serviceability integration. |
| Payments | Which India payment provider and merchant/sub-merchant model? Which payment methods, capture timing, webhook authentication, settlement/reconciliation and marketplace split rules are supported? | Keep provider credentials server-side. Use provider-hosted/tokenized collection, signed webhook verification, idempotent event processing and a server-owned payment state machine. Never mark paid from client input. Provider selection and commercial onboarding are approval gates. |
| Refunds/disputes | Who may initiate full/partial refunds, which order/booking states qualify, how are seller settlements reversed, and how are chargebacks/disputes handled? | Record immutable refund requests/events with actor, reason, provider reference and idempotency key. Reconcile provider state; do not infer refund completion from a browser response. Define support and seller responsibilities first. |
| Stock reservation | Is stock tracked per variant, location, or both? What is the hold duration? Which states consume/release stock? How are oversells, cancellations, payment timeout and partial fulfilment handled? | Reserve inside one database transaction after locking inventory rows in a deterministic order. Enforce `on_hand - reserved >= requested`, append movement/audit rows, and release exactly once on terminal outcomes. Define an expiry worker and retry/idempotency contract before enabling. Unvaried listings need a separately approved stock model. |
| Transactional checkout | Can one order contain multiple sellers? Are taxes/shipping grouped by seller, fulfilment location or shipment? What snapshot fields are required for consumer invoices and returns? | Server resolves published listings, current market prices, seller/business, tax and delivery policies, then persists immutable line snapshots and an idempotency key atomically with reservations. Return an order intent, not a paid order. Payment starts only after the order transaction commits. |

## Configuration shape to review (not active configuration)

When decisions are approved, use an effective-dated, versioned server-side policy record or equivalent configuration service. The following is a contract sketch; values are intentionally unset and it must not be copied into runtime defaults:

```ts
type IndiaCommercePolicyProposal = {
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  marketCode: 'IN';
  currencyCode: 'INR';
  taxPolicy: { status: 'unconfigured'; ownerApproval: null };
  deliveryPolicy: { status: 'unconfigured'; ownerApproval: null };
  paymentProvider: { status: 'unconfigured'; provider: null };
  refundPolicy: { status: 'unconfigured'; ownerApproval: null };
  reservationPolicy: { status: 'unconfigured'; holdDurationSeconds: null };
};
```

Web and native clients should consume the same versioned quote/order API. Clients may display a quote but cannot supply authoritative price, tax, delivery, stock, seller, role or payment status. Keep the current quote-only contract and `checkoutEnabled: false` until all gates above are approved and the transaction implementation is integration-tested.

## Approval and rollout gates

1. Obtain written tax, delivery, payment/settlement, refund and stock policy decisions; select the payment provider and complete its merchant onboarding separately.
2. Review additive schema proposals against the canonical baseline. Run them in disposable local PostgreSQL and test rollback/recovery expectations; do not rewrite existing migration history.
3. Approve and apply each migration separately to the verified Test project, then run authorization, concurrency, idempotency and webhook tests with dedicated test identities.
4. Complete web and mobile contract tests against the same API and verify RLS/role boundaries.
5. Only after explicit production approval and a separate production preflight should a production rollout be planned. This document grants no database, provider, deployment or production authorization.
