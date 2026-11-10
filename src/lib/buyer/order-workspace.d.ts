import type { requestBuyerOrderCancellation } from './order-cancel-client.js';
import type { OrderHistory, OrderDetail } from './orders-client.js';
export type OrderWorkspaceState = {
  phase: 'idle' | 'loading' | 'saving' | 'ready' | 'empty' | 'signin' | 'notfound' | 'error';
  notice?:'cancelled'|'reconcile';
  mode: 'list' | 'detail'; orders: OrderHistory['orders']; detail: OrderDetail | null; nextCursor: string | null;
};
export function createOrderWorkspace(options: {
  read?: (options: {orderId?: string; limit?: number; cursor?: string; signal?: AbortSignal}) => Promise<OrderHistory | OrderDetail>;
  cancel?:typeof requestBuyerOrderCancellation;
  render: (state: OrderWorkspaceState) => void;
}): {load(options?: {orderId?: string; more?: boolean}): Promise<void>; cancel():Promise<void>;clear():void; dispose(): void};
