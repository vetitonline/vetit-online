import type {createCheckoutLifecycleWorker} from './checkout-lifecycle.server.js';
export type MaintenanceCounts=Record<'expired'|'blocked_payment'|'not_pending'|'not_due'|'unavailable',number>;
export function createCheckoutMaintenanceJob(options:{approved?:boolean;worker:Pick<ReturnType<typeof createCheckoutLifecycleWorker>,'payments'|'expireDue'>;batchLimit?:number;intervalMs?:number;now?:()=>number}):{run():Promise<{state:'skipped';reason:'running'|'not_due'}|{state:'completed'|'partial';scanned:number;counts:MaintenanceCounts}>};
