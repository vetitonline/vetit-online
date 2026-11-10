import { requestBuyerOrders } from './orders-client.js';
import { requestBuyerOrderCancellation } from './order-cancel-client.js';

/** Request cancellation and stale-result protection shared by order UI adapters. */
export function createOrderWorkspace({ read = requestBuyerOrders, cancel = requestBuyerOrderCancellation, render }) {
  let revision = 0, active, disposed = false, saving = false, profileId = null;
  let state = { phase: 'idle', mode: 'list', orders: [], detail: null, nextCursor: null };
  function publish(next) { state = next; render(state); }
  async function load({ orderId, more = false } = {}) {
    if (disposed || saving || more && (!state.nextCursor || state.phase === 'loading')) return;
    active?.abort();
    const request = new AbortController(), version = ++revision;
    active = request;
    const previous = more ? state.orders : [];
    const cursor = more ? state.nextCursor : null;
    publish({ phase: 'loading', mode: orderId ? 'detail' : 'list', orders: previous, detail: null, nextCursor: cursor });
    try {
      const result = await read({ ...(orderId ? { orderId } : { limit: 20, ...(cursor ? { cursor } : {}) }), signal: request.signal });
      if (disposed || version !== revision) return;
      if(more && profileId && result.profileId!==profileId) throw Object.assign(Error('Account changed.'),{status:401});
      profileId=result.profileId??null;
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
  function clear(){
    if(disposed)return;
    revision++;active?.abort();saving=false;profileId=null;
    publish({phase:'signin',mode:'list',orders:[],detail:null,nextCursor:null});
  }
  async function cancelOrder(){
    if(disposed||saving||state.phase!=='ready'||!state.detail?.profileId||state.detail.order.order_status!=='pending')return;
    const detail=state.detail,owner=detail.profileId,id=detail.order.id,version=++revision;
    active?.abort();active=new AbortController();saving=true;
    publish({...state,phase:'saving',notice:undefined});
    try{
      const ack=await cancel({orderId:id,profileId:owner,signal:active.signal});
      if(disposed||version!==revision)return;
      if(ack.profileId!==owner||ack.order.id!==id||ack.order.order_status!=='cancelled')throw Error('Cancellation needs reconciliation.');
      const result=await read({orderId:id,signal:active.signal});
      if(disposed||version!==revision)return;
      if(result.profileId!==owner)throw Object.assign(Error('Account changed.'),{status:401});
      if(result.order.id!==id||result.order.order_status!=='cancelled'||result.fulfilments.some(item=>item.status!=='cancelled'))throw Error('Cancellation needs reconciliation.');
      publish({phase:'ready',mode:'detail',orders:[],detail:result,nextCursor:null,notice:'cancelled'});
    }catch(error){
      if(!disposed&&version===revision)publish({phase:error?.status===401?'signin':'error',mode:'detail',orders:[],detail:null,nextCursor:null,notice:'reconcile'});
    }finally{if(version===revision)saving=false;}
  }
  return { load, clear, cancel:cancelOrder, dispose() { disposed = true; revision++; active?.abort(); profileId=null;state={phase:'idle',mode:'list',orders:[],detail:null,nextCursor:null}; } };
}
