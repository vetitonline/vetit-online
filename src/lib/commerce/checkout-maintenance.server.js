import { CheckoutError } from './checkout-service.js';
import { orderId } from '../buyer/order-contract.js';

/** Scheduler-facing sandbox job. No timers, HTTP endpoint, credentials or hosted
 * registration. One bounded worker batch per tick; SQL remains lock authority. */
export function createCheckoutMaintenanceJob({ approved = false, worker, batchLimit = 25, intervalMs = 60000, now = () => Date.now() } = {}) {
  if (approved !== true || worker?.payments?.mode !== 'sandbox' || typeof worker.expireDue !== 'function' || !Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 100 || !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 86400000) {
    throw new CheckoutError('Explicit sandbox maintenance approval and a bounded scheduling policy are required.', 503);
  }
  let active = false, lastStarted = null;
  return {
    async run() {
      if (active) return { state: 'skipped', reason: 'running' };
      const started = now();
      if (!Number.isSafeInteger(started) || started < 0) throw new CheckoutError('Maintenance clock is unavailable.', 503);
      // A backwards wall clock must not postpone maintenance indefinitely.
      if (lastStarted !== null && started >= lastStarted && started - lastStarted < intervalMs) return { state: 'skipped', reason: 'not_due' };
      active = true; lastStarted = started;
      try {
        const batch = await worker.expireDue(batchLimit);
        if (!Number.isInteger(batch?.scanned) || batch.scanned < 0 || batch.scanned > batchLimit || !Array.isArray(batch.results) || batch.results.length !== batch.scanned) throw Error();
        const counts = { expired: 0, blocked_payment: 0, not_pending: 0, not_due: 0, unavailable: 0 };
        const seen = new Set();
        for (const row of batch.results) {
          const id = orderId(row.orderId);
          if (seen.has(id) || !Object.hasOwn(counts, row.outcome) || !['applied','stale','review_required','no_attempt','blocked_payment','unavailable'].includes(row.reconciliation)) throw Error();
          seen.add(id); counts[row.outcome]++;
        }
        // Expose aggregate operational results only, never IDs/provider evidence.
        return { state: counts.unavailable ? 'partial' : 'completed', scanned: batch.scanned, counts };
      } catch {
        // Unknown writes are not retried here. The next scheduled tick must use
        // the worker's database reconciliation path and idempotent expiry locks.
        throw new CheckoutError('Maintenance result is unconfirmed. Reconcile on the next scheduled tick.', 503);
      } finally { active = false; }
    },
  };
}
