import type { OrderHistory, OrderDetail } from './orders-client.js';
export type OrderWorkspaceState = {
  phase: 'idle' | 'loading' | 'ready' | 'empty' | 'signin' | 'notfound' | 'error';
  mode: 'list' | 'detail'; orders: OrderHistory['orders']; detail: OrderDetail | null; nextCursor: string | null;
};
export function createOrderWorkspace(options: {
  read?: (options: {orderId?: string; limit?: number; cursor?: string; signal?: AbortSignal}) => Promise<OrderHistory | OrderDetail>;
  render: (state: OrderWorkspaceState) => void;
}): {load(options?: {orderId?: string; more?: boolean}): Promise<void>; dispose(): void};
