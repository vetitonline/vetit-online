import { requestBuyerOrders } from './orders-client.js';

/** Request cancellation and stale-result protection shared by order UI adapters. */
export function createOrderWorkspace({ read = requestBuyerOrders, render }) {
  let revision = 0, active, disposed = false;
  let state = { phase: 'idle', mode: 'list', orders: [], detail: null, nextCursor: null };
  function publish(next) { state = next; render(state); }
  async function load({ orderId, more = false } = {}) {
    if (disposed || more && (!state.nextCursor || state.phase === 'loading')) return;
    active?.abort();
    const request = new AbortController(), version = ++revision;
    active = request;
    const previous = more ? state.orders : [];
    const cursor = more ? state.nextCursor : null;
    publish({ phase: 'loading', mode: orderId ? 'detail' : 'list', orders: previous, detail: null, nextCursor: cursor });
    try {
      const result = await read({ ...(orderId ? { orderId } : { limit: 20, ...(cursor ? { cursor } : {}) }), signal: request.signal });
      if (disposed || version !== revision) return;
      if (orderId) publish({ phase: 'ready', mode: 'detail', orders: [], detail: result, nextCursor: null });
      else {
        const orders = [...new Map([...previous, ...result.orders].map(order => [order.id, order])).values()];
        // A repeated cursor cannot make a load-more loop.
        publish({ phase: orders.length ? 'ready' : 'empty', mode: 'list', orders, detail: null, nextCursor: result.nextCursor === cursor ? null : result.nextCursor });
      }
    } catch (error) {
      if (disposed || version !== revision) return;
      const phase = error?.status === 401 ? 'signin' : error?.status === 404 ? 'notfound' : 'error';
      publish({ phase, mode: orderId ? 'detail' : 'list', orders: phase === 'signin' ? [] : previous, detail: null, nextCursor: phase === 'signin' ? null : cursor });
    }
  }
  return { load, dispose() { disposed = true; revision++; active?.abort(); } };
}
